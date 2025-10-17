# RenPy Visual Editor

A web-based visual editor for creating and editing interactive scenarios using RenPy syntax.

## Project Overview

This tool helps scenario writers create branching narratives visually without needing to write RenPy code directly. It features:

- Visual node-based editor for RenPy scripts
- Two-way conversion between visual representation and RenPy code
- Real-time collaborative editing
- User-friendly interface for non-technical writers

## Development Roadmap

### Phase 1: Core Parser Implementation ✓
- [x] Implement RenPy parser to convert scripts to tree structure
- [x] Create data model for dialogue nodes
- [x] Support basic RenPy elements (labels, dialogue, menus, conditionals)

### Phase 2: Backend API Setup
- [x] Set up FastAPI basic structure
- [x] Create endpoint for script parsing (text → tree)
- [x] Implement direct script editing (instead of tree → text conversion)
- [x] Implement file upload/download functionality
- [x] Add basic error handling

### Phase 3: Frontend Visual Editor
- [x] Set up React application with basic routing
- [x] Implement node-based editor using ReactFlow
- [x] Create node types for different RenPy elements
- [ ] Add drag-and-drop functionality for connecting nodes
- [x] Implement direct node content editing

### Phase 4: Synchronization & Persistence
- [x] Add database integration for project storage
- [x] Implement user authentication system
- [x] Create project management screens
- [ ] Add file versioning capability

### Phase 5: Real-time Collaboration
- [x] Implement WebSocket connections for real-time updates
- [x] Add user presence indicators
- [ ] Create conflict resolution mechanisms
- [ ] Implement edit history and undo/redo functionality

### Phase 6: Better Implementation & Features
- [x] basic WYSIWYG-dialog editor for node content
- [ ] Add support for more complex RenPy features (transitions, images, etc.)
- [ ] Seamless node graph updates

## Architecture Notes

The editor uses a direct reference approach where visual nodes point to specific line ranges in the original script. This:
- Preserves the original script formatting
- Reduces conversion errors
- Better supports collaborative editing
- Maintains a consistent source of truth

### Branch creation workflow

Use the **Branch tool** in the editor sidebar to add new menu or conditional branches directly to a script:

1. Activate the tool (arrow-into-bar icon) and click a node in the graph.
2. Choose between inserting a menu or an if/elif/else block.
3. Fill out the dialog form, preview the generated Ren'Py snippet, and save.
4. The script is updated through the insert-node API and the graph reloads to show the new branch.

If the selected node is not a valid target (for example, an End node), the tool shows a warning and remains ready for another selection.

## Tech Stack

### Backend
- **Language**: Python 3.12+
- **Framework**: FastAPI
- **Database**: SQLite

### Frontend
- **Framework**: React
- **UI Library**: Material-UI or Chakra UI
- **Graph Visualization**: ReactFlow

## Configuration

The frontend expects API and WebSocket base URLs defined at build time via
`VITE_API_URL` and `VITE_WS_URL` environment variables. When using
`docker compose`, create a `.env` file in the project root with your
backend URL:

```bash
VITE_API_URL=https://renpy.asind.online/api
VITE_WS_URL=wss://renpy.asind.online
```

After updating the file, rebuild the frontend service:

```bash
docker compose build frontend
docker compose up -d
```

This ensures the React application correctly calls the backend on port `9000`
and establishes WebSocket connections using the same host.
