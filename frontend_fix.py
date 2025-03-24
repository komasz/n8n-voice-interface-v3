"""
Script to directly fix the frontend path in app.py
"""
import os
import sys
import fileinput

# Get paths
project_dir = os.path.dirname(os.path.abspath(__file__))
n8n_dir = os.path.join(project_dir, "n8n-voice-interface")
backend_dir = os.path.join(n8n_dir, "backend")
frontend_dir = os.path.join(n8n_dir, "frontend")

def fix_app_py():
    """
    Directly modify app.py to use absolute paths for frontend
    """
    app_file = os.path.join(backend_dir, "app.py")
    
    if not os.path.exists(app_file):
        print(f"ERROR: app.py not found at {app_file}")
        return False
    
    print(f"Modifying {app_file}...")
    
    # First make a backup of the original file
    backup_file = app_file + ".bak"
    try:
        with open(app_file, 'r') as src, open(backup_file, 'w') as dst:
            dst.write(src.read())
        print(f"Created backup at {backup_file}")
    except Exception as e:
        print(f"Failed to create backup: {e}")
        return False
    
    # Now modify the file
    try:
        with open(app_file, 'r') as f:
            content = f.read()
        
        # Replace the relative path with absolute path
        if 'StaticFiles(directory="../frontend"' in content:
            new_content = content.replace(
                'StaticFiles(directory="../frontend"', 
                f'StaticFiles(directory="{frontend_dir}"'
            )
            
            with open(app_file, 'w') as f:
                f.write(new_content)
            
            print("Successfully updated app.py to use absolute path")
            return True
        else:
            print("Could not find the StaticFiles line in app.py")
            return False
            
    except Exception as e:
        print(f"Error modifying app.py: {e}")
        # Restore from backup if modification failed
        try:
            if os.path.exists(backup_file):
                with open(backup_file, 'r') as src, open(app_file, 'w') as dst:
                    dst.write(src.read())
                print("Restored app.py from backup")
        except:
            print("Failed to restore backup")
        return False

if __name__ == "__main__":
    if fix_app_py():
        print("app.py successfully modified. You can now run the application.")
    else:
        print("Failed to modify app.py")
        
        # Try an alternative approach - create a symbolic link
        try:
            link_path = os.path.join(backend_dir, "..", "frontend")
            if not os.path.exists(link_path):
                os.symlink(frontend_dir, link_path)
                print(f"Created symlink from {link_path} to {frontend_dir}")
            else:
                print(f"Path {link_path} already exists")
        except Exception as e:
            print(f"Failed to create symlink: {e}")
