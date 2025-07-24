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
- [ ] Implement WebSocket connections for real-time updates
- [ ] Add user presence indicators
- [ ] Create conflict resolution mechanisms
- [ ] Implement edit history and undo/redo functionality

### Phase 6: Better Implementation & Features
- [ ] WYSIWYG editor for node content
- [ ] Add support for more complex RenPy features (transitions, images, etc.)
- [ ] Seamless node graph updates

## Architecture Notes

The editor uses a direct reference approach where visual nodes point to specific line ranges in the original script. This:
- Preserves the original script formatting
- Reduces conversion errors
- Better supports collaborative editing
- Maintains a consistent source of truth

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

The frontend expects an API base URL defined at build time via the
`VITE_API_URL` environment variable. When using `docker compose`, create
a `.env` file in the project root with your backend URL:

```bash
VITE_API_URL=http://82.202.143.172:9000/api
```

After updating the file, rebuild the frontend service:

```bash
docker compose build frontend
docker compose up -d
```

This ensures the React application correctly calls the backend on port `9000`.
