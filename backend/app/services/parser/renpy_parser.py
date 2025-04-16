from enum import Enum
from pathlib import Path
from typing import List, Optional, Tuple
import asyncio
import aiofiles


class ChoiceNodeType(Enum):
    ACTION = "Action"
    LABEL_BLOCK = "LabelBlock"
    IF_BLOCK = "IfBlock"
    MENU_BLOCK = "MenuBlock"
    MENU_OPTION = "MenuOption"


class ChoiceNode:
    """
    Represents a node in the choice tree structure of a RenPy script.
    
    Attributes:
        label_name (str): The name of the label.
        start_line (int): The starting line number in the script.
        end_line (int): The ending line number in the script.
        node_type (ChoiceNodeType): The type of the node.
        children (List[ChoiceNode]): Child nodes.
        false_branch (List[ChoiceNode]): The false branch children for if/elif/else statements.
    """
    def __init__(self, 
                 label_name: str = "", 
                 start_line: int = 0, 
                 end_line: int = 0, 
                 node_type: ChoiceNodeType = ChoiceNodeType.ACTION):
        self.label_name = label_name
        self.start_line = start_line
        self.end_line = end_line
        self.node_type = node_type
        self.children = []
        self.false_branch = []


class RenPyParser:
    """
    Asynchronous parser for RenPy code using recursive descent to build a choice tree.
    """
    
    def __init__(self):
        self.lines = []
    
    async def parse_async(self, script_path: str) -> ChoiceNode:
        """
        Parses the RenPy script asynchronously and returns the root choice node.
        
        Args:
            script_path: The path to the RenPy script file.
            
        Returns:
            The root choice node of the parsed script.
        """
        try:
            async with aiofiles.open(script_path, 'r', encoding='utf-8') as file:
                content = await file.read()
                self.lines = content.splitlines()
        except (FileNotFoundError, IOError) as e:
            raise IOError(f"Error reading script file: {e}")

        return self._parse_labels()
    
    def _parse_labels(self) -> ChoiceNode:
        """
        Parses the labels in the RenPy script and builds a choice tree.
        
        Returns:
            root_node: The root choice node of the parsed script.
        """
        root_node = ChoiceNode(label_name="root", start_line=0)
        index = 0
        
        while index < len(self.lines):
            line = self.lines[index]
            
            label_info = self._is_label(line)
            if label_info[0]:                
                label_node = ChoiceNode(
                    label_name=label_info[1],
                    start_line=index,
                    node_type=ChoiceNodeType.LABEL_BLOCK
                )
                
                index += 1
                label_child_node = ChoiceNode(start_line=index, node_type=ChoiceNodeType.ACTION)
                
                while True:
                    result, index = self._parse_block(index, 1, label_child_node)
                    if not result:
                        break
                    label_child_node.label_name = self._get_label_name(label_child_node)
                    label_node.children.append(label_child_node)
                    index += 1
                    label_child_node = ChoiceNode(start_line=index, node_type=ChoiceNodeType.ACTION)
                
                # add check before label_child_node
                if label_child_node.end_line >= label_child_node.start_line:
                    label_child_node.label_name = self._get_label_name(label_child_node)
                    label_node.children.append(label_child_node)
                
                label_child_node.start_line = index
                
                label_node.end_line = index - 1
                root_node.children.append(label_node)
            else:
                # skip lines before the next label
                index += 1
        
        return root_node
    
    def _parse_block(self, index: int, indent_level: int, current_node: ChoiceNode) -> Tuple[bool, int]:
        """
        Parses a block of lines with a given indentation level and updates the current node.
        
        Args:
            index: The current index in the lines array.
            indent_level: The expected indentation level.
            current_node: The current choice node being parsed.
            
        Returns:
            True if a new statement is encountered, otherwise False.
        """
        while index < len(self.lines):
            current_line = self.lines[index]
            current_indent = self._get_indent_level(current_line)
            
            if not current_line.strip():
                index += 1
                continue
            
            if current_indent < indent_level:
                index -= 1
                current_node.end_line = index
                return False, index
            
            if not self._is_a_statement(current_line.strip()):
                index += 1
                continue
            
            if current_node.start_line != index:
                index -= 1
                current_node.end_line = index
                return True, index
            
            trimmed_line = current_line.strip()
            
            if self._is_if_statement(trimmed_line):
                index = self._parse_statement(index, current_node, current_indent, ChoiceNodeType.IF_BLOCK)
                return True, index
            
            if self._is_menu_statement(trimmed_line):
                # Use the returned index to skip re-parsing menu lines
                index = self._parse_menu_block(index, current_node, current_indent)
                return True, index
            
            # Other statements can be handled here
            index += 1

        index -= 1
        current_node.end_line = index
        return False, index
    
    def _parse_statement(self, index: int, current_node: ChoiceNode, 
                         current_indent: int, node_type: ChoiceNodeType) -> int:
        """
        Parses a statement block and updates the current node.
        
        Args:
            index: The current index in the lines array.
            current_node: The current choice node being parsed.
            current_indent: The current indentation level.
            node_type: The type of the node being parsed.
            
        Returns:
            The updated index.
        """
        current_node.node_type = node_type
        current_node.end_line = index
        index += 1
        statement_node = ChoiceNode(start_line=index, node_type=ChoiceNodeType.ACTION)
          # Parse the 'true' branch
        while True:
            temp, index = self._parse_block(index, current_indent + 1, statement_node)
            
            statement_node.label_name = self._get_label_name(statement_node)
            
            # Only append nodes with valid content
            if statement_node.start_line <= statement_node.end_line:
                current_node.children.append(statement_node)
            
            if not temp:
                break
                
            index += 1
            statement_node = ChoiceNode(start_line=index, node_type=ChoiceNodeType.ACTION)
        
        # Check for 'elif' or 'else' at the same indentation level
        while index + 1 < len(self.lines):
            index += 1
            next_line = self.lines[index]
            next_indent = self._get_indent_level(next_line)
            next_line_trimmed = next_line.strip()
            
            if not next_line.strip():
                continue
            
            if next_indent != current_indent:
                index -= 1
                break
            
            if self._is_elif_statement(next_line_trimmed):
                # Parse 'elif' as FalseBranch
                false_branch_node = ChoiceNode(start_line=index)
                index = self._parse_statement(index, false_branch_node, current_indent, ChoiceNodeType.IF_BLOCK)
                false_branch_node.label_name = self._get_label_name(false_branch_node)
                # Append to false_branch list instead of direct assignment
                current_node.false_branch.append(false_branch_node)
                return index              # Handle 'else' statement
            if self._is_else_statement(next_line_trimmed):
                # Process all nodes in else branch
                index += 1
                while True:
                    false_branch_node = ChoiceNode(start_line=index, node_type=ChoiceNodeType.ACTION)
                    result, index = self._parse_block(index, current_indent + 1, false_branch_node)
                    
                    if false_branch_node.end_line >= false_branch_node.start_line:
                        false_branch_node.label_name = self._get_label_name(false_branch_node)
                        current_node.false_branch.append(false_branch_node)
                    
                    if not result:
                        break
                        
                    index += 1
                    
                return index
            
            index -= 1
            break
        
        return index
    
    def _parse_menu_block(self, index: int, menu_node: ChoiceNode, indent_level: int) -> int:
        """
        Parses a menu block and updates the menu node.
        Returns the updated index to avoid re-parsing the same lines.
        """
        menu_node.start_line = index
        menu_node.end_line = index
        menu_node.node_type = ChoiceNodeType.MENU_BLOCK
        index += 1

        while index < len(self.lines):
            line = self.lines[index]
            current_indent = self._get_indent_level(line)

            if not line.strip():
                index += 1
                continue

            if current_indent <= indent_level:
                index -= 1
                return index

            line = line.strip()
            if line.startswith('"') and line.endswith(':'):
                choice_node = ChoiceNode(
                    label_name=line.rstrip(':').strip(),
                    start_line=index,
                    node_type=ChoiceNodeType.MENU_OPTION
                )
                index = self._parse_statement(index, choice_node, current_indent, ChoiceNodeType.MENU_OPTION)
                menu_node.children.append(choice_node)
            else:
                index += 1

        return index
    
    def _is_label(self, line: str) -> Tuple[bool, Optional[str]]:
        """
        Determines if a line is a label and extracts the label name.
        
        Args:
            line: The line to check.
            
        Returns:
            A tuple of (is_label, label_name)
        """
        line = line.strip()
        if line.startswith("label ") and line.endswith(':'):
            label_name = line[6:-1].strip()
            return True, label_name
        return False, None
    
    @staticmethod
    def _is_if_statement(line: str) -> bool:
        """
        Determines if a line is an if statement.
        
        Args:
            line: The line to check.
            
        Returns:
            True if the line is an if statement, otherwise False.
        """
        return line.lstrip().startswith("if ") and line.endswith(":")
    
    @staticmethod
    def _is_else_statement(line: str) -> bool:
        """
        Determines if a line is an else statement.
        
        Args:
            line: The line to check.
            
        Returns:
            True if the line is an else statement, otherwise False.
        """
        return line.lstrip().startswith("else") and line.endswith(':')
    
    @staticmethod
    def _is_elif_statement(line: str) -> bool:
        """
        Determines if a line is an elif statement.
        
        Args:
            line: The line to check.
            
        Returns:
            True if the line is an elif statement, otherwise False.
        """
        return line.lstrip().startswith("elif ") and line.endswith(':')
    
    @staticmethod
    def _is_a_statement(line: str) -> bool:
        """
        Determines if a line is a statement.
        
        Args:
            line: The line to check.
            
        Returns:
            True if the line is a statement, otherwise False.
        """
        trimmed_line = line.lstrip()
        return (trimmed_line.startswith("if ") or 
                trimmed_line.startswith("elif ") or 
                trimmed_line.startswith("menu"))
    
    @staticmethod
    def _is_menu_statement(line: str) -> bool:
        """
        Determines if a line is a menu statement.
        
        Args:
            line: The line to check.
            
        Returns:
            True if the line is a menu statement, otherwise False.
        """
        trimmed_line = line.lstrip()
        return trimmed_line.startswith("menu") and trimmed_line.endswith(":")
    
    @staticmethod
    def _get_indent_level(line: str) -> int:
        """
        Gets the indentation level of a line.
        
        Args:
            line: The line to check.
            
        Returns:
            The indentation level.
        """
        indent = 0
        tab_score = 0
        
        for char in line:
            if char == '\t':
                tab_score = 0
                indent += 1
            elif char == ' ':
                tab_score += 1
                if tab_score == 4:
                    indent += 1
                    tab_score = 0
            else:
                break
                
        return indent
    
    def _is_dialog_line(self, line: str) -> bool:
        """
        Checks if a line matches the RenPy dialog pattern:
        - Optional character name/expression followed by space
        - Text in quotes
        - Optional space at the end
        """
        line = line.strip()
        
        # Check if the line has quotes
        if '"' not in line:
            return False
        
        # Check if the line ends with a quote (ignoring trailing spaces)
        if not line.rstrip().endswith('"'):
            return False
        
        # Split at the first quote
        parts = line.split('"', 1)
        
        # If it starts with a quote, it's a dialog line without character name
        if line.startswith('"'):
            return True
        
        # There should be a space between character name and the opening quote
        character_part = parts[0].strip()
        return character_part.endswith(' ')
    
    def _remove_bracketed_content(self, text: str) -> str:
        """
        Removes all content enclosed in brackets, including the brackets themselves.
        For example, "1{brackets}23" becomes "123".
        
        Args:
            text: The input text to process
            
        Returns:
            Text with all bracketed content removed
        """
        result = ""
        bracket_level = 0
        
        for char in text:
            if char == '{':
                bracket_level += 1
            elif char == '}':
                bracket_level = max(0, bracket_level - 1)  # Ensure we don't go negative
            elif bracket_level == 0:
                result += char
                
        return result

    def _get_label_name(self, node: ChoiceNode) -> str:
        """
        Gets a descriptive label name for a node based on its content.
        
        For nodes with more than 4 lines, attempts to find dialog lines in RenPy format
        (character name followed by quoted text).
        
        Args:
            node: The node to get a label name for.
            
        Returns:
            A descriptive label name.
        """
        # Check if start_line or end_line is out of range
        if node.start_line >= len(self.lines) or node.end_line >= len(self.lines) or node.start_line < 0 or node.end_line < 0:
            return ""
        
        # If the first line ends with ":", it's a statement declaration
        if (node.start_line < len(self.lines) and 
            self._is_a_statement(self.lines[node.start_line]) and 
            self.lines[node.start_line].endswith(':')):
            return self.lines[node.start_line][:-1].strip()
        
        label_parts = []
        total_lines = node.end_line - node.start_line + 1
        
        # For small blocks (4 or fewer lines), include all non-empty lines
        if total_lines <= 4:
            for i in range(node.start_line, min(node.end_line + 1, len(self.lines))):
                if not self.lines[i].strip():
                    continue
                label_parts.append(self.lines[i].strip())
        else:
            # Try to find dialog lines
            first_dialog_lines = []
            last_dialog_lines = []
            
            # Find first two dialog lines
            for i in range(node.start_line, min(node.end_line + 1, len(self.lines))):
                line = self.lines[i].strip()
                if not line:
                    continue
                
                if self._is_dialog_line(line):
                    first_dialog_lines.append(line)
                    if len(first_dialog_lines) >= 2:
                        break
            
            # Find last two dialog lines (in correct order)
            for i in range(node.end_line, node.start_line - 1, -1):
                if i >= len(self.lines):
                    continue
                    
                line = self.lines[i].strip()
                if not line:
                    continue
                
                if self._is_dialog_line(line):
                    last_dialog_lines.insert(0, line)  # Insert at beginning to maintain order
                    if len(last_dialog_lines) >= 2:
                        break
            
            # Use dialog lines if we found any
            if first_dialog_lines or last_dialog_lines:
                label_parts.extend(first_dialog_lines)
                
                # Only add separator if we have both first and last sections
                if first_dialog_lines and last_dialog_lines and first_dialog_lines[-1] != last_dialog_lines[0]:
                    label_parts.append("<...>")
                    
                # Avoid duplicating lines
                for line in last_dialog_lines:
                    if not first_dialog_lines or line not in first_dialog_lines:
                        label_parts.append(line)
            else:
                # Fall back to using first/last 3 lines
                appended_lines = 0
                for i in range(node.start_line, min(node.end_line + 1, len(self.lines))):
                    if not self.lines[i].strip():
                        continue
                    label_parts.append(self.lines[i].strip())
                    appended_lines += 1
                    if appended_lines >= 3:
                        break
                
                label_parts.append("<...>")
                
                last_lines = []
                for i in range(node.end_line, node.start_line - 1, -1):
                    if i >= len(self.lines) or not self.lines[i].strip():
                        continue
                    last_lines.insert(0, self.lines[i].strip())
                    if len(last_lines) >= 3:
                        break
                
                label_parts.extend(last_lines)
        
        # If we still have no label parts, just get all lines in the range to be safe
        if not label_parts:
            for i in range(node.start_line, min(node.end_line + 1, len(self.lines))):
                line = self.lines[i].strip()
                if line:
                    label_parts.append(line)
        
        # Handle special commands like return/jump
        if not label_parts and node.start_line < len(self.lines):
            # Last attempt - use the single line directly
            line = self.lines[node.start_line].strip()
            if line:
                label_parts.append(line)
        
        label_text = "\n".join(label_parts)
        
        # Remove content within brackets (including the brackets)
        if not node.node_type == ChoiceNodeType.IF_BLOCK and not node.node_type == ChoiceNodeType.MENU_OPTION:
            label_text = self._remove_bracketed_content(label_text)

        # If the label is still empty or very short, try every line in the range
        if len(label_text) < 20:
            combined_text = []
            
            # Important: Include ALL lines in the node's range
            for i in range(node.start_line, min(node.end_line + 1, len(self.lines))):
                if i < len(self.lines):  # Double-check index
                    line = self.lines[i].strip()
                    if line:
                        combined_text.append(line)
            
            if combined_text:
                label_text = "\n".join(combined_text)
        
        # Truncate to 100 characters if text is too long
        if len(label_text) > 100:
            label_text = label_text[:97] + "..."
            
        return label_text