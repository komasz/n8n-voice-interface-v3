"""
Package installer script for Replit that works around externally managed environment
"""
import os
import sys
import subprocess
import site
import importlib

# Required packages
REQUIRED_PACKAGES = [
    "fastapi==0.103.1",
    "uvicorn==0.23.2",
    "python-multipart==0.0.6",
    "httpx==0.26.0",
    "requests==2.31.0",
    "python-dotenv==1.0.0",
    "pydantic==2.3.0",
    "pydub==0.25.1"
]

def check_package(package_name):
    """Check if a package is installed"""
    package_base = package_name.split('==')[0]
    try:
        importlib.import_module(package_base)
        return True
    except ImportError:
        return False

def install_packages():
    """Install required packages to user site-packages"""
    # Create user site directory if it doesn't exist
    user_site = site.getusersitepackages()
    os.makedirs(user_site, exist_ok=True)
    
    print(f"Installing packages to: {user_site}")
    
    # Make sure the user site is in the Python path
    if user_site not in sys.path:
        sys.path.insert(0, user_site)
        print(f"Added {user_site} to Python path")
    
    # Install packages that are not already installed
    packages_to_install = []
    for package in REQUIRED_PACKAGES:
        package_base = package.split('==')[0]
        if not check_package(package_base):
            packages_to_install.append(package)
    
    if not packages_to_install:
        print("All required packages are already installed!")
        return
    
    print(f"Installing packages: {packages_to_install}")
    
    try:
        # Install packages using pip with --user flag
        subprocess.check_call([
            sys.executable, 
            "-m", 
            "pip", 
            "install", 
            "--user", 
            *packages_to_install
        ])
        print("Package installation successful!")
    except subprocess.CalledProcessError as e:
        print(f"Error installing packages: {e}")
        # Try with --break-system-packages if --user fails
        try:
            print("Trying with --break-system-packages...")
            subprocess.check_call([
                sys.executable, 
                "-m", 
                "pip", 
                "install", 
                "--user",
                "--break-system-packages",
                *packages_to_install
            ])
            print("Package installation successful with --break-system-packages!")
        except subprocess.CalledProcessError as e:
            print(f"Error installing packages with --break-system-packages: {e}")
            sys.exit(1)

if __name__ == "__main__":
    install_packages()
