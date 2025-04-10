from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Body
from fastapi.responses import JSONResponse, FileResponse
import os
import tempfile
import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
import uuid

from ...services.parser.renpy_parser import RenPyParser, ChoiceNode, ChoiceNodeType


scripts_router = APIRouter(
    prefix="/scripts",
    tags=["scripts"],
    responses={404: {"description": "Not found"}},
)


script_files = {}


def node_to_dict(node: ChoiceNode) -> Dict[str, Any]:
    """Convert a ChoiceNode to a dictionary with line references for JSON serialization."""
    result = {
        "id": str(uuid.uuid4()),  
        "label_name": node.label_name,
        "start_line": node.start_line,
        "end_line": node.end_line,
        "node_type": node.node_type.value,
        "children": [node_to_dict(child) for child in node.children]
    }
    
    if node.false_branch:
        result["false_branch"] = node_to_dict(node.false_branch)
        
    return result

@scripts_router.post("/parse")
async def parse_script(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Parse a RenPy script file and return its tree structure with line references.
    
    Args:
        file: The uploaded RenPy script file
        
    Returns:
        JSON representation of the parsed script tree with line references
    """
    try:
        
        if not file.filename.lower().endswith(".rpy"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only .rpy files are allowed.")
            
        
        file_size = 0
        content = await file.read()
        file_size = len(content)
        
        if file_size > 1024 * 1024:  
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 1MB.")
        
        
        script_id = str(uuid.uuid4())
        temp_dir = Path(tempfile.gettempdir()) / "renpy_editor" / script_id
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        script_path = temp_dir / file.filename
        import aiofiles
        async with aiofiles.open(script_path, "wb") as f:
            await f.write(content)
        
        
        script_files[script_id] = {
            "path": str(script_path),
            "filename": file.filename,
            "content_lines": content.decode('utf-8').splitlines()
        }
        
        
        parser = RenPyParser()
        parsed_tree = await parser.parse_async(str(script_path))
        
        
        result = {
            "script_id": script_id,
            "filename": file.filename,
            "tree": node_to_dict(parsed_tree)
        }
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing script: {str(e)}")

@scripts_router.get("/node-content/{script_id}")
async def get_node_content(script_id: str, start_line: int, end_line: int) -> Dict[str, Any]:
    """
    Get the content of a specific node based on its line range.
    
    Args:
        script_id: The ID of the parsed script
        start_line: The starting line number
        end_line: The ending line number
        
    Returns:
        The content of the specified lines
    """
    if script_id not in script_files:
        raise HTTPException(status_code=404, detail="Script not found")
    
    try:
        script_info = script_files[script_id]
        content_lines = script_info["content_lines"]
        
        
        start = max(0, start_line)
        end = min(len(content_lines), end_line + 1)
        
        
        node_content = content_lines[start:end]
        
        return {
            "content": "\n".join(node_content),
            "start_line": start_line,
            "end_line": end_line
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving node content: {str(e)}")

@scripts_router.post("/update-node/{script_id}")
async def update_node_content(
    script_id: str, 
    start_line: int, 
    end_line: int, 
    content: str = Body(..., embed=True)
) -> Dict[str, Any]:
    """
    Update the content of a specific node in the script.
    
    Args:
        script_id: The ID of the parsed script
        start_line: The starting line number
        end_line: The ending line number
        content: The new content for the node
        
    Returns:
        Updated line information
    """
    if script_id not in script_files:
        raise HTTPException(status_code=404, detail="Script not found")
    
    try:
        script_info = script_files[script_id]
        content_lines = script_info["content_lines"]
        script_path = script_info["path"]
        
        
        new_content_lines = content.splitlines()
        
        
        old_line_count = end_line - start_line + 1
        new_line_count = len(new_content_lines)
        line_diff = new_line_count - old_line_count
        
        
        content_lines[start_line:end_line+1] = new_content_lines
        
        
        with open(script_path, "w", encoding="utf-8") as f:
            f.write("\n".join(content_lines))
        
        
        script_files[script_id]["content_lines"] = content_lines
        
        
        new_end_line = start_line + new_line_count - 1
        
        return {
            "start_line": start_line,
            "end_line": new_end_line,
            "line_diff": line_diff
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating node content: {str(e)}")

@scripts_router.post("/insert-node/{script_id}")
async def insert_node(
    script_id: str, 
    insertion_line: int, 
    content: str = Body(..., embed=True),
    node_type: str = Body(..., embed=True)
) -> Dict[str, Any]:
    """
    Insert a new node at the specified position.
    
    Args:
        script_id: The ID of the parsed script
        insertion_line: The line where to insert the new node
        content: The content of the new node
        node_type: The type of node to insert
        
    Returns:
        Information about the inserted node
    """
    if script_id not in script_files:
        raise HTTPException(status_code=404, detail="Script not found")
    
    try:
        script_info = script_files[script_id]
        content_lines = script_info["content_lines"]
        script_path = script_info["path"]
        
        
        new_content_lines = content.splitlines()
        
        
        content_lines[insertion_line:insertion_line] = new_content_lines
        
        
        with open(script_path, "w", encoding="utf-8") as f:
            f.write("\n".join(content_lines))
        
        
        script_files[script_id]["content_lines"] = content_lines
        
        
        new_line_count = len(new_content_lines)
        
        
        parser = RenPyParser()
        parsed_tree = await parser.parse_async(script_path)
        
        return {
            "start_line": insertion_line,
            "end_line": insertion_line + new_line_count - 1,
            "line_count": new_line_count,
            "tree": node_to_dict(parsed_tree)  
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inserting node: {str(e)}")

@scripts_router.get("/download/{script_id}")
async def download_script(script_id: str) -> Any:
    """
    Download the current version of the script.
    
    Args:
        script_id: The ID of the parsed script
        
    Returns:
        The script file for download
    """
    if script_id not in script_files:
        raise HTTPException(status_code=404, detail="Script not found")
    
    try:
        script_info = script_files[script_id]
        script_path = script_info["path"]
        filename = script_info["filename"]
        
        return JSONResponse({
            "filename": filename,
            "content": "\n".join(script_info["content_lines"])
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error downloading script: {str(e)}")

@scripts_router.delete("/{script_id}")
async def close_script(script_id: str) -> Dict[str, str]:
    """
    Close and clean up a script session.
    
    Args:
        script_id: The ID of the script to close
        
    Returns:
        Confirmation message
    """
    if script_id not in script_files:
        raise HTTPException(status_code=404, detail="Script not found")
    
    try:
        
        script_info = script_files[script_id]
        script_path = Path(script_info["path"])
        script_dir = script_path.parent
        
        
        del script_files[script_id]
        
        
        try:
            shutil.rmtree(script_dir)
        except:
            pass  
        
        return {"message": "Script closed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error closing script: {str(e)}")