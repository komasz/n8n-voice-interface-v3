"""
Fallback solution to install packages locally in the project directory
"""
import os
import sys
import subprocess
import tempfile
import shutil
import zipfile
import io
import urllib.request

# Required packages with their PyPI URLs
PACKAGES = {
    "fastapi": "https://files.pythonhosted.org/packages/e9/8e/8cf143f1877d36e1349f247c8c6a2a5a6167ebe4d2f74f01ac3170cd4b20/fastapi-0.103.1-py3-none-any.whl",
    "uvicorn": "https://files.pythonhosted.org/packages/da/e6/5b6643559066d0e71dfcf597c9d2b1b52a54e5dba4da1e3fdf7ae6f78f61/uvicorn-0.23.2-py3-none-any.whl",
    "python-multipart": "https://files.pythonhosted.org/packages/2d/23/4bcaa5c59f33815fe5fa35f8b302e723aa078cad11486f212b27c0725e5f/python_multipart-0.0.6-py3-none-any.whl",
    "httpx": "https://files.pythonhosted.org/packages/fb/c2/ec87f5926d78afe6263a48a0fa985fc244106d5c1dc4d33089f4fc0b71d2/httpx-0.26.0-py3-none-any.whl",
    "requests": "https://files.pythonhosted.org/packages/70/8e/0e2d847013cb52cd35b38c009bb167a1a26b2ce6cd6de7ff3ad99b46355c/requests-2.31.0-py3-none-any.whl",
    "python-dotenv": "https://files.pythonhosted.org/packages/54/a0/d6ca34e377cff1a8ef10ce526ec3f14b4f410afe63a88272c543a511adbf/python_dotenv-1.0.0-py3-none-any.whl",
    "pydantic": "https://files.pythonhosted.org/packages/9c/c0/c33e515a2f3b9659a3a148de4ae144970e57ffa402f2ec1276fd1ed60723/pydantic-2.3.0-py3-none-any.whl",
    "pydub": "https://files.pythonhosted.org/packages/af/77/5c2b5436d5b42b1d9d521aa8c67e1af11607dbadbcc8a1712cd516cfb5c4/pydub-0.25.1-py2.py3-none-any.whl"
}

def download_and_extract_whl(url, dest_dir):
    """Download a wheel file and extract it"""
    print(f"Downloading {url}...")
    with urllib.request.urlopen(url) as response:
        whl_content = response.read()
    
    with io.BytesIO(whl_content) as whl_file:
        with zipfile.ZipFile(whl_file) as zip_ref:
            zip_ref.extractall(dest_dir)
    
    print(f"Extracted to {dest_dir}")

def setup_local_packages():
    """Download and install packages locally"""
    # Create a lib directory in the project
    lib_dir = os.path.join(os.getcwd(), "lib")
    os.makedirs(lib_dir, exist_ok=True)
    
    # Add the lib directory to Python path
    if lib_dir not in sys.path:
        sys.path.insert(0, lib_dir)
    
    # Download and extract each package
    for package, url in PACKAGES.items():
        download_and_extract_whl(url, lib_dir)
    
    print("Packages installed locally. Added lib directory to Python path.")
    print(f"Lib directory: {lib_dir}")
    
    # Create a .pth file in the current directory to ensure paths are loaded
    with open("local_packages.pth", "w") as f:
        f.write(f"{lib_dir}\n")
    
    return lib_dir

if __name__ == "__main__":
    lib_dir = setup_local_packages()
    print(f"Local packages are installed in: {lib_dir}")
    print("Make sure to add this directory to your Python path:")
    print(f"import sys; sys.path.insert(0, '{lib_dir}')")
