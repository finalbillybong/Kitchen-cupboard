import os
import sys
from pathlib import Path


# Configure the application before any test module imports backend settings.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["SECRET_KEY"] = "backend-tests-only-secure-key-with-more-than-enough-entropy-123456789"
os.environ["DATABASE_URL"] = "sqlite:///file:kitchen_cupboard_tests?mode=memory&cache=shared&uri=true"
