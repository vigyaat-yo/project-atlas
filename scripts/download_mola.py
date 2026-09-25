from pathlib import Path
import requests

RAW_DIR = Path("data/raw")
RAW_DIR.mkdir(parents=True, exist_ok=True)

url = "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html"

print("MOLA data source:")
print(url)
print()
print("Our raw-data directory is ready:")
print(RAW_DIR.resolve())