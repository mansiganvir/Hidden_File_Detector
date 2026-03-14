import os
import stat
import platform
import datetime
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

def is_hidden(filepath):
    """Check if a file or directory is hidden."""
    name = os.path.basename(os.path.abspath(filepath))
    
    # Check for Unix-like hidden files
    if name.startswith('.'):
        return True
        
    # Check for Windows hidden files
    if platform.system() == 'Windows':
        try:
            attrs = os.stat(filepath).st_file_attributes
            return bool(attrs & stat.FILE_ATTRIBUTE_HIDDEN)
        except AttributeError:
            # Fallback if st_file_attributes is not available
            pass
        except OSError:
            pass # File might not exist or permission denied
            
    return False

def is_system_file(filepath):
    """Check if a file or directory is a Windows 'super hidden' (System) file."""
    if platform.system() == 'Windows':
        import ctypes
        FILE_ATTRIBUTE_SYSTEM = 4
        try:
            attrs = ctypes.windll.kernel32.GetFileAttributesW(filepath)
            if attrs != -1:
                return bool(attrs & FILE_ATTRIBUTE_SYSTEM)
        except Exception:
            pass
    return False

def get_file_info(filepath):
    """Get basic information about a file."""
    try:
        stat_info = os.stat(filepath)
        return {
            "name": os.path.basename(filepath),
            "path": filepath,
            "is_dir": os.path.isdir(filepath),
            "is_hidden": is_hidden(filepath),
            "is_system": is_system_file(filepath),
            "size": stat_info.st_size,
            "modified": datetime.datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
            "created": datetime.datetime.fromtimestamp(stat_info.st_ctime).isoformat()
        }
    except Exception as e:
        return {"error": str(e), "path": filepath, "name": os.path.basename(filepath), "is_hidden": is_hidden(filepath), "is_system": is_system_file(filepath)}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/explore', methods=['POST'])
def explore_directory():
    data = request.json
    target_path = data.get('path', '.')
    
    if not target_path:
        target_path = '.'
        
    target_path = os.path.abspath(target_path)
    
    if not os.path.exists(target_path) or not os.path.isdir(target_path):
        return jsonify({"error": "Invalid directory path"}), 400
        
    try:
        items = []
        for item in os.listdir(target_path):
            full_path = os.path.join(target_path, item)
            items.append(get_file_info(full_path))
            
        # Sort items: directories first, then files
        items.sort(key=lambda x: (not x.get('is_dir', False), x.get('name', '').lower()))
        
        return jsonify({
            "current_path": target_path,
            "parent_path": os.path.dirname(target_path),
            "items": items
        })
    except PermissionError:
        return jsonify({"error": "Permission denied"}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
