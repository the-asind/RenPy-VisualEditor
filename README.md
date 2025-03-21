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
- [ ] Set up FastAPI basic structure
- [ ] Create endpoint for script parsing (text → tree)
- [ ] Create endpoint for script generation (tree → text)
- [ ] Implement file upload/download functionality
- [ ] Add basic error handling

### Phase 3: Frontend Visual Editor
- [ ] Set up React application with basic routing
- [ ] Implement node-based editor using ReactFlow
- [ ] Create node types for different RenPy elements
- [ ] Add drag-and-drop functionality for connecting nodes
- [ ] Implement basic editing of node properties

### Phase 4: Synchronization & Persistence
- [ ] Add database integration for project storage
- [ ] Implement user authentication system
- [ ] Create project management screens
- [ ] Add file versioning capability

### Phase 5: Real-time Collaboration
- [ ] Implement WebSocket connections for real-time updates
- [ ] Add user presence indicators
- [ ] Create conflict resolution mechanisms
- [ ] Implement edit history and undo/redo functionality

## Tech Stack

### Backend
- **Language**: Python 3.12+
- **Framework**: FastAPI
- **Database**: SQLite

### Frontend
- **Framework**: React
- **UI Library**: Material-UI or Chakra UI
- **Graph Visualization**: ReactFlow

## Project Structure

```
renpy-visual-editor/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── api/              # API endpoints
│   │   ├── services/         # Business logic
│   │   │   └── parser.py     # RenPy parser implementation
│   │   └── models/           # Data models
│   └── requirements.txt
│
└── frontend/
    ├── public/
    ├── src/
    │   ├── components/       # React components
    │   │   └── Editor/       # Visual editor components
    │   ├── services/         # API communication
    │   └── App.js
    └── package.json
```
