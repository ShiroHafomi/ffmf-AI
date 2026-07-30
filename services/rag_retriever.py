"""Retrieval layer for the expense-forecasting RAG pipeline.

Genuine RAG = RETRIEVE -> AUGMENT -> GENERATE.

This module owns the **retrieve** half:

1. A curated corpus of financial-advice snippets (budgeting heuristics,
   category-specific tips, seasonal notes, savings/debt guidance).
2. A hybrid lexical retriever that, given the *household's current situation*,
   returns the K most relevant snippets. It combines TF-IDF cosine similarity
   (with word + bigram features) and a lightweight keyword-boost so the
   household's actual situation (overspent category, budget pressure, trend)
   steers which advice surfaces. This grounds the generator in real knowledge
   instead of letting it hallucinate generic advice.

The retriever is fully offline (no network, no API key, no embedding model) so
it runs in the deterministic/free path too — retrieval enriches suggestions
even when no LLM is configured.
"""

import logging
import os
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger("ffms")

# How many knowledge snippets to retrieve and inject per forecast.
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))

# Maximum allowed query length for RAG retrieval (guard against injection/DoS)
MAX_QUERY_LENGTH = int(os.getenv("RAG_MAX_QUERY_LENGTH", "200"))

# Regex for sanitizing category names - keep only alphanumeric and spaces
_CATEGORY_SANITIZE_RE = re.compile(r"[^a-zA-Z0-9\s\-_]")


def _sanitize_category_name(name: str) -> str:
    """Sanitize category name for use in RAG query.

    Strips non-alphanumeric characters (except hyphens and underscores),
    collapses whitespace, and limits length.
    """
    if not name:
        return ""
    # Remove special characters
    sanitized = _CATEGORY_SANITIZE_RE.sub(" ", name)
    # Collapse whitespace and trim
    sanitized = " ".join(sanitized.split())
    # Limit length to reasonable value
    return sanitized[:50]


def _sanitize_and_truncate_query(query: str, max_length: int = MAX_QUERY_LENGTH) -> str:
    """Sanitize and truncate query to prevent injection/DoS."""
    if not query:
        return ""
    # Collapse whitespace
    query = " ".join(query.split())
    # Truncate
    if len(query) > max_length:
        query = query[:max_length]
    return query

# ───────────────────────── Knowledge corpus ─────────────────────────
# Each entry is one self-contained piece of advice. TF-IDF matches on the
# natural language, so snippet text doubles as its own index — no separate
# tags needed. Keep snippets concrete and actionable.
#
# The original 20 snippets are kept verbatim (existing tests pin their text);
# newer entries are appended after them.
FINANCIAL_KNOWLEDGE_BASE: list[str] = [
    "Groceries are usually the most flexible category. Plan weekly meals, shop "
    "with a list, buy staples in bulk, and compare unit prices to cut 10-20% "
    "without changing what you eat.",

    "Frequent restaurant and delivery spending adds up fast. Cap dining-out to a "
    "fixed weekly amount and treat it as the first thing you pause when the "
    "budget is tight.",

    "Fuel and transport costs are semi-fixed but responsive to habits. Combine "
    "errands into fewer trips, use transit for short commutes, and review "
    "ride-share usage, which is easy to overuse.",

    "Electricity and utility bills swing with the season. Shift heavy appliance "
    "use to off-peak hours, fix standby power drain, and set a conservative "
    "thermostat to flatten the peak month.",

    "Subscriptions silently erode the budget. Audit every recurring charge "
    "monthly, cancel what you have not used in 30 days, and keep only the few "
    "services you actively use.",

    "Entertainment is the easiest lever during a tight month. Move social plans "
    "to low-cost or free activities and treat one-off events as exceptions, not "
    "the baseline.",

    "Impulse shopping drives avoidable spikes. Apply a 48-hour wait before "
    "non-essential purchases and unsubscribe from marketing emails that trigger "
    "spending.",

    "Housing and rent are the largest fixed cost and hard to change mid-year. "
    "Protect them first, then optimise variable categories around them rather "
    "than the reverse.",

    "Build a small emergency fund equal to one month of essential spending "
    "before optimising anything else, so a single shock does not cascade into "
    "debt.",

    "If carrying high-interest debt, prioritise paying it down before "
    "discretionary spending — the interest saved usually beats any return "
    "earned elsewhere.",

    "Automate savings the day income arrives. Treat the transfer as a fixed bill "
    "so the surplus is saved before it can be spent.",

    "Use the 50/30/20 rule as a sanity check: roughly half of income to needs, "
    "30% to wants, and 20% to savings and debt repayment.",

    "Holiday and year-end months spike spending. Set a separate holiday limit in "
    "advance and pre-fund it so December does not blow the annual average.",

    "Back-to-school and seasonal education costs arrive in predictable months. "
    "Spread the spend across the prior two months instead of one peak.",

    "When income is uneven, base the monthly budget on the lower typical month "
    "and bank the surplus from good months as a buffer.",

    "After an over-budget month, do not cut everything at once. Pick the single "
    "largest overspent category and bring it back to plan first.",

    "A sudden monthly spike usually traces to one large transaction. Review the "
    "top three charges of that month before assuming the new level is the trend.",

    "Forecasts near the recent average are safer than chasing the last spike. "
    "Anchor plans to the trailing average and treat deviations as upside or "
    "risk, not the base case.",

    "Watch categories that exceed 30% of total spend — they concentrate risk. "
    "Diversify the cuts so no single category can derail the whole budget.",

    "Lunar New Year and cultural holiday periods create predictable large "
    "outflows. Pre-allocate a fixed celebration budget and avoid borrowing to "
    "fund them.",

    # ── Appended: deeper, situation-specific guidance ──
    "Car and vehicle costs (fuel, maintenance, insurance, loan) form a large "
    "semi-fixed block. Shop auto insurance annually, keep tyres inflated, and "
    "batch errands to cut fuel without changing your routine.",

    "Healthcare and medical costs are unpredictable — fund a dedicated medical "
    "sinking fund and keep a small stock of recurring prescriptions so a health "
    "event never becomes a panic spend.",

    "For several debts, the avalanche method (highest interest first) saves the "
    "most money, while the snowball method (smallest balance first) builds "
    "momentum. Pick one and automate the payments.",

    "A 50/30/20 plan only works once you know your real split. Review one month "
    "of statements to see your actual needs/wants/savings ratio before setting "
    "targets — most households underestimate wants.",

    "Inflation quietly raises recurring costs 3-8% a year. Bake a small annual "
    "uplift into your baseline budget so 'normal' months do not slowly drift "
    "over budget.",

    "Irregular income (freelance, commission, seasonal work) needs a base budget "
    "set to your worst recent month, with surplus months topping a buffer "
    "rather than lifting your lifestyle.",

    "Sinking funds prevent one-off blows: set aside a little each month for "
    "known annual costs (insurance, holidays, school fees, car service) so they "
    "never hit as a single spike.",

    "Free trials are a top silent leak. Use a calendar reminder to cancel before "
    "the trial ends and re-review the subscription list every month.",

    "Big-ticket purchases deserve a 30-day rule plus a price check across three "
    "sellers; most 'urgent' buys are not actually urgent.",

    "Track your savings rate (saved divided by net income). Aim for 15-20%; if "
    "it is below 5%, cut one discretionary category before touching essentials.",

    "Shared households need one agreed owner per category and a monthly money "
    "date to review overspends before they compound into arguments or debt.",

    "Cashback, rewards and points are a bonus, not a reason to spend. Ignore "
    "them entirely when deciding whether to buy.",

    "If a month comes in under budget, bank the difference into savings "
    "immediately — do not let a 'good month' quietly become a spending month.",

    "Compare each category to its own 3-month average, not just the total. A "
    "category that is flat in absolute terms but grew versus its own baseline is "
    "still an early warning.",

    "Energy and utility costs respond to habits more than tariffs for most "
    "homes: switch to LED bulbs, lower the thermostat 1-2 degrees, unplug "
    "standby devices, and shift laundry to off-peak hours.",

    "Build the emergency fund in stages: one week of essentials, then one month, "
    "then three. Each stage lowers the chance a single shock turns into debt.",

    # ── Expanded: deeper financial guidance ──
    "Review your budget at the same time each month so it becomes a habit, "
    "not a chore. Consistency matters more than perfection.",

    "The most common budgeting mistake is underestimating irregular expenses "
    "(car repairs, medical co-pays, gifts). Add a 10% buffer to every "
    "category that covers periodic costs.",

    "When you get a raise or bonus, increase your savings rate first, "
    "then adjust your lifestyle. Lifestyle creep is the silent budget killer.",

    "Debt payoff strategies: the avalanche method (highest interest first) "
    "saves the most money; the snowball method (smallest balance first) "
    "builds psychological momentum. Pick one and automate it.",

    "Credit card interest compounds daily. Paying even a small amount "
    "above the minimum dramatically reduces the total interest paid over time.",

    "Negotiate recurring bills annually — insurance, internet, phone. "
    "A single call can save 10-20% with no lifestyle change.",

    "Use a separate 'fun money' account with a fixed monthly transfer. "
    "When it is gone, it is gone — this creates a natural spending brake.",

    "Meal prep on a weekend batch-cook saves both time and money during "
    "the week and reduces the temptation to order delivery.",

    "Avoid lifestyle inflation: when fixed costs go down (loan paid off, "
    "child leaves home) redirect the freed cash to savings or investments "
    "rather than upgrading your living standard.",

    "Track net worth quarterly (assets minus liabilities). The trend "
    "matters more than any single month's number.",

    "Set specific savings goals with deadlines — 'vacation fund by June' "
    "is more motivating and measurable than 'save more'.",

    "Use the envelope method for discretionary categories: allocate cash "
    "into separate envelopes (physical or virtual) and stop when the "
    "envelope is empty.",

    "Before any major purchase over $500, wait 72 hours and compare at "
    "least three options. This small delay prevents most buyer's remorse.",

    "Negotiate your salary at least once a year. Even a 3% annual raise "
    "compounds significantly over a decade.",

    "Insurance is about risk management, not saving money. Make sure you "
    "have adequate coverage for catastrophic risks (health, property, "
    "liability) before optimising premiums.",

    "Tax optimisation is legal: maximise retirement contributions, claim "
    "all eligible deductions, and review your withholding annually.",

    "Financial goals fall into three buckets — short-term (0-1 year), "
    "medium-term (1-5 years), and long-term (5+ years). Allocate savings "
    "proportionally across all three instead of focusing on only one.",

    "A 'no-spend' day or week once a month resets spending awareness and "
    "breaks autopilot consumption patterns.",

    " teach children about money early — allowances with savings goals "
    "and age-appropriate financial decisions build lifelong habits.",

    "When investing, focus on low-cost index funds over individual stocks. "
    "Time in the market beats timing the market for most households.",

    "Review your financial plan every quarter. Life changes — income, "
    "family size, goals — and your budget should adapt accordingly.",
]


# ───────────────────────── Query sanitization ─────────────────────────
# Maximum query length to prevent injection/DoS via oversized queries.
MAX_QUERY_LENGTH = 200


def _sanitize_category_name(name: str) -> str:
    """Sanitize a category name for safe use in RAG queries.

    Strips non-alphanumeric characters (keeping spaces, hyphens, underscores),
    limits length, and returns empty string if the result is invalid.
    """
    if not name:
        return ""

    # Keep only alphanumeric, spaces, hyphens, and underscores
    sanitized = re.sub(r"[^a-zA-Z0-9\s\-_]", "", name)
    # Collapse multiple spaces
    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    # Limit length
    if len(sanitized) > 50:
        sanitized = sanitized[:50]
    # Must have at least one alphanumeric character
    if not any(c.isalnum() for c in sanitized):
        return ""
    return sanitized


# Keywords that, when present in BOTH the query and a snippet, earn a small
# additive relevance boost. This makes retrieval situation-aware: an overspent
# "food" category nudges food tips up even when TF-IDF alone is ambiguous.
# Bigrams (space-containing terms) are stronger signals than single words.
_BOOST_TERMS: tuple[str, ...] = (
    # Core spending categories
    "groceries", "food", "rent", "housing", "fuel", "transport", "utility",
    "electricity", "subscription", "entertainment", "shopping", "impulse",
    # Financial goals and state
    "debt", "savings", "budget", "emergency", "income", "seasonal", "holiday",
    "school", "medical", "vehicle", "insurance", "investment", "retirement",
    # Situation signals
    "overspent", "over budget", "increasing", "decreasing", "spike", "anomaly",
    "fixed cost", "sinking fund", "surplus", "deficit", "break even",
    # Dining & lifestyle
    "restaurant", "delivery", "dining out", "dine in", "coffee", "cafe",
    # Seasonal & periodic
    "festival", "celebration", "year end", "back to school", "tax",
    "travel", "vacation", "child", "elder", "dependent",
    # Behavioral / habit signals
    "habit", "routine", "cancel", "audit", "review", "track", "monitor",
    "automate", "buffer", "fund", "leak", "waste", "optimize",
    # Risk & protection
    "risk", "protection", "coverage", "emergency fund", "safety net",
    "recession", "uncertain", "job loss", "layoff",
    # Debt & credit
    "interest rate", "compound", "apy", "debt payoff", "refinance",
    # Value & cost management
    "bulk", "discount", "coupon", "deal", "compare", "negotiate",
    # Health & wellness
    "health", "fitness", "gym", "wellness", "mental health",
    # Education
    "tuition", "training", "skill", "course", "certificate",
)

# Synonym expansion for richer query representation.
# Each key maps from a common term to a set of semantically related
# words that TF-IDF may not catch directly.
_QUERY_EXPANSION: dict[str, tuple[str, ...]] = {
    "food": ("groceries", "meal", "kitchen", "cooking", "dining"),
    "groceries": ("food", "supermarket", "produce", "grocery"),
    "rent": ("housing", "lease", "mortgage", "accommodation"),
    "housing": ("rent", "mortgage", "lease", "property", "dwelling"),
    "fuel": ("gas", "petrol", "petroleum", "energy"),
    "transport": ("travel", "commute", "fuel", "car", "public transit"),
    "utility": ("electricity", "water", "gas", "internet", "phone"),
    "subscription": ("membership", "streaming", "service", "recurring"),
    "entertainment": ("fun", "hobby", "leisure", "dining out", "media"),
    "shopping": ("purchase", "buy", "retail", "impulse"),
    "impulse": ("unplanned", "spontaneous", "emotional"),
    "debt": ("loan", "credit", "obligation", "owe", "liability"),
    "savings": ("save", "reserve", "fund", "nest egg", "security"),
    "budget": ("plan", "allocation", "spending plan", "envelope"),
    "emergency": ("rainy day", "safety net", "buffer", "unexpected"),
    "income": ("earnings", "salary", "wage", "revenue", "pay"),
    "holiday": ("festival", "celebration", "ceremony", "cultural"),
    "medical": ("health", "doctor", "hospital", "clinical", "wellness"),
    "vehicle": ("car", "auto", "transport", "driving"),
    "overspent": ("over budget", "exceeded", "breached", "gone over"),
    "increasing": ("rising", "growing", "upward", "up"),
    "decreasing": ("declining", "falling", "downward", "down"),
    "spike": ("surge", "jump", "spike", "burst", "sharp rise"),
    "anomaly": ("unusual", "outlier", "unexpected", "irregular"),
    "fixed cost": ("recurring", "regular", "stable", "predictable"),
    "sinking fund": ("reserve", "provision", "set aside", "annual fund"),
    "restaurant": ("dining out", "eating out", "takeaway", "food service"),
    "insurance": ("coverage", "policy", "premium", "protection"),
    "vacation": ("travel", "holiday", "trip", "getaway"),
}

# ───────────────────────── Fitted retriever (cached) ─────────────────────────
# The corpus is static, so we fit the vectorizer once at import time and reuse
# it for every query. ngram_range adds bigrams so phrases like "over budget"
# and "spending increasing" match directly; sublinear_tf tames very frequent
# terms. Guard against an empty corpus (defensive).
_VECTORIZER: TfidfVectorizer | None = None
_CORPUS_MATRIX = None

if FINANCIAL_KNOWLEDGE_BASE:
    _VECTORIZER = TfidfVectorizer(
        stop_words="english", ngram_range=(1, 2), sublinear_tf=True
    )
    _CORPUS_MATRIX = _VECTORIZER.fit_transform(FINANCIAL_KNOWLEDGE_BASE)


def _keyword_boost(query: str) -> dict[int, float]:
    """Map corpus index -> additive boost for situation keywords in ``query``."""
    q = query.lower()
    boost: dict[int, float] = {}
    for i, snippet in enumerate(FINANCIAL_KNOWLEDGE_BASE):
        text = snippet.lower()
        score = 0.0
        for term in _BOOST_TERMS:
            if term in q and term in text:
                # Bigrams are stronger, more specific signals than single words.
                score += 0.15 if " " in term else 0.05
        if score:
            boost[i] = score
    return boost


def _expand_query(query: str) -> str:
    """Expand ``query`` with semantically related synonyms from _QUERY_EXPANSION
    for better TF-IDF recall. Only words that actually appear in the corpus
    are added — no blind injection.

    E.g. "overspent food" -> "overspent food groceries meal kitchen".
    """
    words = set(query.lower().split())
    expanded = set(words)
    for word in words:
        for synonym in _QUERY_EXPANSION.get(word, ()):
            # Only add synonyms that appear as whole words in at least
            # one snippet — avoids noise from irrelevant expansions.
            for snippet in FINANCIAL_KNOWLEDGE_BASE:
                if synonym.lower() in snippet.lower():
                    expanded.add(synonym.lower())
                    break
    return " ".join(expanded)


def retrieve_knowledge(query: str, top_k: int = RAG_TOP_K) -> list[str]:
    """Return the ``top_k`` most relevant advice snippets for ``query``.

    Retrieval is hybrid lexical (TF-IDF cosine + keyword boost) with
    query expansion (synonym injection) for better recall. If the corpus
    is empty or the query is blank, returns the first ``top_k`` snippets as a
    safe default. Never raises — a retrieval failure must not break the forecast.
    """
    # Guard: empty query or corpus
    if _VECTORIZER is None or _CORPUS_MATRIX is None or not query.strip():
        return list(FINANCIAL_KNOWLEDGE_BASE[: max(top_k, 0)])

    # Guard: max query length to prevent injection/DoS
    query = _sanitize_and_truncate_query(query, MAX_QUERY_LENGTH)

    k = min(max(top_k, 1), len(FINANCIAL_KNOWLEDGE_BASE))
    try:
        # Use expanded query for broader recall while still using the
        # original query for the boosted keyword filter.
        expanded_query = _expand_query(query)
        q_vec = _VECTORIZER.transform([expanded_query])
        scores = cosine_similarity(q_vec, _CORPUS_MATRIX).ravel()
        boost = _keyword_boost(query)
        combined = scores + np.array(
            [boost.get(i, 0.0) for i in range(len(scores))]
        )
        # Stable descending sort so ties break by corpus order (earlier first).
        order = np.argsort(combined, kind="stable")[::-1][:k]
        return [FINANCIAL_KNOWLEDGE_BASE[i] for i in order]
    except Exception:  # noqa: BLE001 — retrieval must never break forecasting
        logger.warning("RAG retrieval failed; using corpus prefix fallback.")
        return list(FINANCIAL_KNOWLEDGE_BASE[:k])


def _seasonal_hint(month: int) -> str:
    """Return a seasonal label for the given calendar month (1-12)."""
    if month in (11, 12, 1):
        return "year-end holiday season"
    if month in (2, 3, 4):
        return "spring"
    if month in (5, 6, 7, 8):
        return "summer"
    if month in (8, 9):
        return "back-to-school season"
    if month in (9, 10, 11):
        return "autumn"
    return ""


def build_knowledge_query(
    data: list[dict],
    amount_key: str,
    category_context: list[dict] | None,
    budget: float | None,
    kind: str,
) -> str:
    """Build the retrieval query from the household's *situation* signals.

    The query is deliberately keyword-dense so TF-IDF lands on the right
    snippets: trend direction/strength/acceleration, budget pressure,
    overspent categories, dominant category, and seasonality.
    It does not leak raw amounts — just the qualitative state.

    Query expansion (synonyms) is applied in retrieve_knowledge so
    the TF-IDF matcher has broader recall for each signal word.
    """
    parts: list[str] = []

    label = "income" if kind == "income" else "expense"
    parts.append(f"household {label} forecast")

    amounts = [float(row.get(amount_key, 0)) for row in data] if data else []
    if len(amounts) >= 2:
        slope = amounts[-1] - amounts[0]
        if slope > 0:
            parts.append("spending increasing upward trend")
        elif slope < 0:
            parts.append("spending decreasing downward trend")
        else:
            parts.append("spending stable flat trend")

        # Relative strength: >=15% of base is a strong trend.
        base = abs(amounts[0]) or 1.0
        if abs(slope / base) * 100 >= 15:
            parts.append("strong trend")
        elif abs(slope / base) * 100 >= 5:
            parts.append("moderate trend")

        # Acceleration/deceleration check (last 3 months vs full period).
        if len(amounts) >= 4:
            recent_slope = amounts[-1] - amounts[-3]
            full_slope = slope
            if abs(full_slope) > 0:
                accel = recent_slope / full_slope
                if accel > 1.3:
                    parts.append("trend accelerating faster")
                elif accel < 0.7:
                    parts.append("trend decelerating slowing down")

    last = amounts[-1] if amounts else 0.0
    if budget is not None:
        if last > float(budget):
            parts.append("over budget warning")
        else:
            parts.append("under budget on track")
        # How far over/under as a percentage of budget.
        budget_pct = (last / float(budget) * 100) if budget else 0
        if budget_pct >= 100:
            parts.append("severely over budget")
        elif budget_pct >= 80:
            parts.append("near budget limit")

    # Overspent / present categories name the levers to retrieve tips for.
    if category_context:
        for c in category_context:
            name = (c.get("category_name") or "").strip()
            if not name:
                continue
            # Sanitize category name to prevent injection
            name = _sanitize_category_name(name)
            if not name:
                continue
            parts.append(name.lower())
            bud = c.get("budget_amount")
            spent = float(c.get("total", 0))
            if bud is not None and spent > float(bud):
                parts.append(f"{name.lower()} overspent over budget")
            # Add budget-usage percentage as a signal for retrieval.
            if bud and float(bud) > 0:
                usage = int(spent / float(bud) * 100)
                if usage >= 90:
                    parts.append(f"{name.lower()} nearly at budget limit")

        # Dominant category (largest spend) is the highest-priority lever.
        try:
            dom = max(category_context, key=lambda c: float(c.get("total", 0)))
            dn = (dom.get("category_name") or "").strip()
            if dn:
                dn = _sanitize_category_name(dn)
                if dn:
                    parts.append(f"dominant category {dn.lower()}")
                    # If the dominant category is also overspent, add a
                    # stronger signal so specific tips surface.
                    dom_bud = dom.get("budget_amount")
                    dom_spent = float(dom.get("total", 0))
                    if dom_bud and dom_spent > float(dom_bud):
                        parts.append(f"dominant category {dn.lower()} overspent")
        except (ValueError, TypeError):
            pass

    # Seasonality hint: which calendar month we are forecasting (+1 from
    # the last recorded month).
    if data:
        m = int(data[-1].get("month", 0))
        next_month = (m % 12) + 1
        season = _seasonal_hint(next_month)
        if season:
            parts.append(season)

    # Volume of transactions as a signal (high frequency = more tips
    # about tracking and automation).
    if category_context:
        total_count = sum(
            int(c.get("transaction_count", 0) or 0) for c in category_context
        )
        if total_count > 50:
            parts.append("high transaction volume")

    return " ".join(parts)
