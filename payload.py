import json
import socket
import sys
import traceback
import inspect
import types
import io
import time
import select

class SocketWriter(io.IOBase):
    def __init__(self, sock):
        self.sock = sock
    def write(self, data):
        if data:
            response = {
                "type": "output",
                "data": data
            }
            self.sock.sendall(json.dumps(response).encode("utf-8") + b"\n")
        return len(data)
    def flush(self):
        pass

def get_callable_info(obj):
    """Get information about object callables."""
    callables = {}
    try:
        for name in dir(obj):
            if not name.startswith('_'):
                try:
                    attr = getattr(obj, name)
                    if callable(attr):
                        # Check if callable is builtin
                        is_builtin = (
                            getattr(attr, '__module__', None) == 'builtins' or
                            type(attr).__module__ == 'builtins' or
                            name in dir(__builtins__)
                        )
                        
                        # Get full signature including return type annotations if available
                        try:
                            sig = inspect.signature(attr)
                            return_annotation = sig.return_annotation
                            if return_annotation is not inspect.Signature.empty:
                                return_type = return_annotation.__name__ if hasattr(return_annotation, '__name__') else str(return_annotation)
                            else:
                                return_type = None
                        except ValueError:
                            sig = None
                            return_type = None
                        
                        # Determine method type
                        if isinstance(attr, staticmethod):
                            method_type = 'static'
                        elif inspect.isfunction(attr):
                            # Check if it's a class method
                            if isinstance(obj, type) and getattr(obj, name, None) is attr:
                                method_type = 'static'
                            else:
                                method_type = 'function'
                        elif inspect.ismethod(attr):
                            if attr.__self__ is obj:
                                method_type = 'class'
                            else:
                                method_type = 'instance'
                        else:
                            method_type = 'other'
                        
                        # Get source if available
                        try:
                            source = inspect.getsource(attr) if inspect.isfunction(attr) or inspect.ismethod(attr) else None
                        except (TypeError, OSError):
                            source = None
                        
                        callables[name] = {
                            'type': 'method',
                            'method_type': method_type,
                            'callable_type': type(attr).__name__,
                            'is_builtin': is_builtin,
                            'doc': inspect.getdoc(attr) or "No documentation available",
                            'signature': str(sig) if sig else "Signature unavailable",
                            'return_type': return_type,
                            'source_file': inspect.getfile(attr) if inspect.isfunction(attr) else None,
                            'source': source,
                            'is_async': inspect.iscoroutinefunction(attr) or inspect.isasyncgenfunction(attr),
                            'is_generator': inspect.isgeneratorfunction(attr),
                            'is_property': isinstance(attr, property),
                            'decorators': get_decorator_info(attr, obj, name)
                        }
                except Exception as e:
                    callables[name] = {
                        'type': 'error',
                        'error_type': type(e).__name__,
                        'error': str(e)
                    }
    except Exception as e:
        print(f"Error getting callables: {e}")
    return callables

def get_decorator_info(attr, obj, name):
    """Get information about decorators applied to a callable."""
    decorators = []
    try:
        # Check common decorators
        if isinstance(attr, staticmethod):
            decorators.append('@staticmethod')
        elif isinstance(attr, classmethod):
            decorators.append('@classmethod')
        elif isinstance(attr, property):
            decorators.append('@property')
        
        # Try to get source and parse decorators
        try:
            source = inspect.getsource(attr)
            lines = source.split('\n')
            # Look for decorator lines before the def
            for line in lines:
                line = line.strip()
                if line.startswith('def '):
                    break
                if line.startswith('@') and line not in decorators:
                    decorators.append(line)
        except:
            pass
    except:
        pass
    return decorators

def get_attribute_info(obj):
    """Get information about object attributes."""
    attributes = {}
    try:
        for name in dir(obj):
            if not name.startswith('_'):
                try:
                    attr = getattr(obj, name)
                    if not callable(attr):
                        # Check if attribute is builtin
                        is_builtin = (
                            getattr(attr, '__module__', None) == 'builtins' or
                            type(attr).__module__ == 'builtins' or
                            name in dir(__builtins__)
                        )
                        
                        attributes[name] = {
                            'type': type(attr).__name__,
                            'category': get_object_category(attr),
                            'is_builtin': is_builtin,
                            'value': str(attr) if not isinstance(attr, (dict, list, tuple, set)) else f"{type(attr).__name__}({len(attr)} items)"
                        }
                except Exception as e:
                    attributes[name] = {
                        'type': 'error',
                        'error_type': type(e).__name__,
                        'error': str(e)
                    }
    except Exception as e:
        print(f"Error getting attributes: {e}")
    return attributes

def get_object_category(obj):
    """Get the category of a Python object."""
    if inspect.ismodule(obj):
        return 'module'
    elif inspect.isclass(obj):
        return 'class'
    elif isinstance(obj, (int, float, complex)):
        return 'number'
    elif isinstance(obj, str):
        return 'string'
    elif isinstance(obj, (list, tuple)):
        return 'sequence'
    elif isinstance(obj, dict):
        return 'dictionary'
    else:
        return 'other'

def get_object_metadata(obj, category):
    """Get metadata about a Python object."""
    metadata = {
        'module': getattr(obj, '__module__', None),
        'qualname': getattr(obj, '__qualname__', None),
        'file': inspect.getfile(obj) if inspect.getmodule(obj) else None,
        'size': len(obj) if hasattr(obj, '__len__') else None,
        'bases': [base.__name__ for base in obj.__class__.__bases__] if hasattr(obj, '__class__') else None,
    }
    
    if category == 'sequence':
        metadata['length'] = len(obj)
        metadata['element_types'] = list(set(type(x).__name__ for x in obj[:5]))  # Sample first 5 elements
    elif category == 'dictionary':
        metadata['length'] = len(obj)
        metadata['key_types'] = list(set(type(k).__name__ for k in list(obj.keys())[:5]))
        metadata['value_types'] = list(set(type(v).__name__ for v in list(obj.values())[:5]))
    
    return metadata

def get_object_info(obj, path='', include_builtins=False):
    """Get detailed information about a Python object."""
    try:
        # Get basic type information
        obj_type = type(obj)
        type_name = obj_type.__name__
        
        # Check if object is a builtin
        is_builtin = (
            obj_type.__module__ == 'builtins' or
            (hasattr(obj, '__module__') and obj.__module__ == 'builtins') or
            type_name in dir(__builtins__)
        )
        
        # Get object category
        category = get_object_category(obj)
        
        # Get string representation safely
        try:
            str_val = str(obj)
            if len(str_val) > 1000:  # Truncate long strings
                str_val = str_val[:1000] + '...'
        except Exception as e:
            str_val = f"<Error getting string representation: {str(e)}>"

        # Get metadata based on category
        metadata = get_object_metadata(obj, category)
        
        # Get attributes and methods
        attributes = get_attribute_info(obj) if category != 'primitive' else {}
        methods = get_callable_info(obj) if category != 'primitive' else {}
        
        # Filter out builtins if requested
        if not include_builtins:
            attributes = {k: v for k, v in attributes.items() if not v.get('is_builtin', False)}
            methods = {k: v for k, v in methods.items() if not v.get('is_builtin', False)}
        
        return {
            'type': type_name,
            'category': category,
            'is_builtin': is_builtin,
            'value': str_val,
            'metadata': metadata,
            'attributes': attributes,
            'methods': methods
        }
    except Exception as e:
        return {
            'type': 'error',
            'error_type': type(e).__name__,
            'error': str(e)
        }

def handle_command(cmd, globals_dict):
    try:
        if not isinstance(cmd, dict):
            return {"type": "error", "error": "Invalid command format"}
            
        cmd_type = cmd.get("type")
        if not cmd_type:
            return {"type": "error", "error": "No command type specified"}
            
        if cmd_type == "repl":
            code = str(cmd.get("code", ""))
            if not code:
                return {"type": "error", "error": "No code provided"}
                
            try:
                compiled = compile(code, "<repl>", "exec")
                exec(compiled, globals_dict, globals_dict)
                return {"type": "success", "message": "Code executed successfully"}
            except Exception as e:
                err = traceback.format_exc()
                return {"type": "error", "error": err}
                
        elif cmd_type == "inspect":
            try:
                expr = str(cmd.get("expression", ""))
                if not expr:
                    return {"type": "error", "error": "No expression provided"}
                    
                obj = eval(expr, globals_dict, globals_dict)
                info = get_object_info(obj)
                return {"type": "inspect_result", "data": info}
            except Exception as e:
                return {"type": "error", "error": str(e)}
        else:
            return {"type": "error", "error": f"Unknown command type: {cmd_type}"}
    except Exception as e:
        return {"type": "error", "error": f"Command handling error: {str(e)}"}

def connect_socket(host, port, timeout=5):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setblocking(False)
    r = s.connect_ex((host, port))
    if r not in (0, 10035):
        return None
    
    start_time = time.time()
    while True:
        _, w, _ = select.select([], [s], [], 0.05)
        if s in w:
            e = s.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR)
            if e != 0:
                s.close()
                return None
            return s
        if time.time() - start_time > timeout:
            s.close()
            return None

def run_repl(host, port):
    while True:
        try:
            s = connect_socket(host, port)
            
            if not s:
                time.sleep(5)
                continue

            w = SocketWriter(s)
            sys.stdout = w
            sys.stderr = w

            response = {
                "type": "status",
                "status": "connected",
                "message": "Python API endpoint ready"
            }
            s.sendall(json.dumps(response).encode("utf-8") + b"\n")

            buf = b""
            running = True

            while running:
                rs, _, _ = select.select([s], [], [], 0.05)
                if s in rs:
                    data = s.recv(4096)
                    if not data:
                        break
                    buf += data
                    while b"\n" in buf:
                        line, _, buf = buf.partition(b"\n")
                        try:
                            cmd = json.loads(line.decode("utf-8", "replace"))
                            if cmd.get("type") == "exit":
                                running = False
                                response = {"type": "status", "status": "disconnected"}
                                break
                            
                            response = handle_command(cmd, globals())
                            s.sendall(json.dumps(response).encode("utf-8") + b"\n")
                        except json.JSONDecodeError:
                            response = {"type": "error", "error": "Invalid JSON"}
                            s.sendall(json.dumps(response).encode("utf-8") + b"\n")
                        except Exception as e:
                            response = {"type": "error", "error": str(e)}
                            s.sendall(json.dumps(response).encode("utf-8") + b"\n")

            s.close()

        except KeyboardInterrupt:
            sys.exit(0)
        except:
            pass
            
        try:
            s.close()
        except:
            pass
            
        time.sleep(5)


run_repl("__HOST__", __PORT__)
