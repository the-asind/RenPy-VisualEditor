"""
This file configures pytest to add the parent directory to the Python path,
which allows imports from the app module to work properly.
"""
import os
import sys
from pathlib import Path

# Add the parent directory to the Python path so that 'app' can be imported
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))
