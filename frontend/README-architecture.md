# Frontend Architecture Features

### Phase 1 — MVP Editor

The editor is structured as trees that start with a **LabelBlock** and end with an **“end”** block. The number of LabelBlocks corresponds to the number of tabs, which can be switched on the fly.

1. **Main Page:**  
   When visiting the main page, the user is redirected to `/editor`.

2. **File Options:**  
   Initially, the user can either open an existing working file (with a `.rpy` extension and size not exceeding the limit defined in the API) or create a new empty file that contains only the line `label Start:`.

3. **Node Structure:**  
   Each node comes with the following properties:
   - **Identifier:** `id`
   - **Name:** `label_name`
   - **Code Line Range:** starting (`start_line`) and ending (`end_line`) lines (inclusive) in the code.
   - **Node Type:** `node_type`
   - **Children:** Nested child nodes under the `children` property.
   - **False Branch (if applicable):** For conditional “IF” nodes, a `false_branch` is provided following the children.

4. **Visual Representation:**  
   Every node is visually rendered using React Flow:
   - Nodes are arranged from top to bottom.
   - If nodes need to be placed on the same level, sibling nodes are arranged horizontally.

5. **Node Appearance and Interaction:**  
   Each node is displayed with a unique color (dependent on its `node_type`) and its own `label_name`. When a node is clicked:
   - A built-in text editor pops up.
   - The editor view is truncated to display only the lines from `start_line` to `end_line` from the original `.rpy` file.

6. **LabelBlock Characteristics:**  
   At the very top of each LabelBlock:
   - The color is yellow.
   - LabelBlocks are not interlinked; each LabelBlock is located in its own tab at the top.
   - A LabelBlock starts a connection tree underneath itself that always ends with an **“end”** block specific to that LabelBlock.

7. **Action Node:**  
   - **Color:** A pale or off-white shade.
   - Action nodes form a continuous sequence of blocks where each node is connected vertically to the previous and next ones within the `children` list of their parent—regardless of the JSON nesting level.
   - Each Action node is linked to the previous and next Action node within its parent block so that all nodes remain connected within a single LabelBlock.

8. **General Node Ordering:**  
   According to the API call examples (excluding nodes under `ifBlock` and `menuBlock`):
   - All nodes are arranged strictly from top to bottom.
   - The direct (or “straight”) path means adjacent children listed from first to last.
   - The main sequence flows through the center.
   - When blocks are meant to be arranged horizontally, they are centered. For example, for three blocks the second will be centered; for two blocks, one is placed left of center and the other right of center at equal distances.

9. **MenuBlock Node:**  
   - **Color:** Maroon (burgundy).
   - It contains multiple child nodes (from 1 to infinity), each being a **MenuOption** node.
   - All MenuOption children should be arranged on one horizontal line, even though the overall reading order is top-to-bottom.
   - Each MenuOption is positioned horizontally directly under its parent MenuBlock.

10. **MenuOption Node:**  
    - **Color:** Orange.
    - It holds children in the standard, nested manner.

11. **IfBlock Node:**  
    - **Color:** Green.
    - The `children` represent the result when the condition is **True**. This branch is shifted to the right and its connecting arrow/node is labeled “True.”
    - The `false_branch` property represents the result when the condition is **False**. This branch is shifted to the left and its connecting arrow/node is labeled “False.”
    - If the `false_branch` is missing, the “False” arrow connects to the nearest subsequent node in the execution flow.
    - If an IfBlock without a `false_branch` is the last node within its parent, the “False” arrow should lead to the next block at the parent level of the current node.
    - If there is no `false_branch` and no higher-level parents remain, then the “False” arrow will point to the very last **“end”** block.
    - Infinite nesting of if-else structures is possible; therefore, in cases of nested blocks with horizontal divergence, the upper nodes should be spaced further apart horizontally to accommodate the lower branches.

12. **“End” Block:**  
    - Once all the nodes in a LabelBlock tree are constructed, the branch concludes with an empty **“end”** block where all arrows seeking continuation converge.
    - Clicking the **“end”** block does nothing.
    - The block is colored gray.
    - Each LabelBlock tree begins with the LabelBlock itself and always ends with this **“end”** block.
    - The **“end”** block is generated on the frontend with the `label_name` “Конец” (which means “End”).

13. **Dragging and Moving Blocks:**  
    - Moving any block on the canvas causes all of its subordinate blocks to move along with it. Thus, dragging a LabelBlock will move the entire connected tree.

14. **Local Text Editor Details:**  
    - The text editor is a popup window on the site, offering options to close without saving or to save changes.
    - It utilizes the [CodeMirror](https://www.npmjs.com/package/%40uiw/react-codemirror?activeTab=readme) text editor library.
    - The popup includes a functional button labeled “Switch to full editor,” which, after confirmation if there are unsaved changes, closes the local editor and opens the full file editor (`GlobalEditor`).
    - The local editor temporarily removes indentations for ease of editing, preserving them internally. (Note: Current implementation edits a slice, indentation handling might need refinement).
    - After making changes in the local editor, a local parser runs before saving:
      - If a hint for the creation of a new block (other than an Action) is detected (e.g., lines starting with `"if "`, `"menu "`, or `"label "`), the tree is rebuilt from scratch after saving. (Note: Current implementation reloads the file on save, achieving this).
      - Otherwise, the original indentations are restored and the file is saved without altering the tree. (Note: Indentation handling needs review based on slice editing).
      - If a line beginning with `"return"` is found, a warning is issued before saving, indicating that subsequent blocks will become unreachable.

15. **Global Editor Details:**  
    - Upon opening the global editor, a warning is displayed about the potential consequences (e.g., "Editing the full file may desynchronize the visual representation until saved and re-parsed.").
    - The backend is notified that someone is editing the full file (`notifyEditingGlobal` API call). (Note: Pinging is not part of MVP frontend).
    - Once the global editing is finished and changes are saved, the tree is forcefully rebuilt (achieved by `loadFile` after `saveFile`).
    - The global editor is based on CodeMirror. When the global editor is opened, any active local editor (`NodeEditor`) should be closed (handled by the switching logic).
    - While the global editor is active, the visual tree (`FlowEditor`) remains unchanged. A warning overlay is displayed on the `FlowEditor` indicating this mode. Clicking a node while the global editor is active should ideally focus the global editor at that node’s `start_line`. (Note: Focusing line is a potential enhancement, MVP just opens global editor).

16. **No Block Addition Outside of Editing (MVP):**  
    - In the MVP implementation, adding blocks outside of the editing interface is not supported.

17. **Pop-up Notifications:**  
    - Error messages and suggestions are displayed as on-site pop-up notifications.
    - These notifications cannot be closed without clicking one of the provided action buttons.
