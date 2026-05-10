import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from routes.predict import predict

try:
    result = predict(1)
    print("SUCCESS")
    print(result)
except Exception as e:
    import traceback
    traceback.print_exc()
