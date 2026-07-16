import os
import sys

# Make the repo root importable so `services.ai_service` resolves under pytest.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
