from enum import Enum
from pathlib import Path
from typing import List, Optional, Tuple
import asyncio
import aiofiles


class ChoiceNodeType(Enum):
    ACTION = "Action"
    LABEL_BLOCK = "LabelBlock"
    IF_BLOCK = "IfBlock"
    ELSE_BLOCK = "ElseBlock"
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
        false_branch (Optional[ChoiceNode]): The false branch for if/elif/else statements.
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
        self.false_branch = None


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
        Parses the labels in the script lines and builds the choice tree.
        
        Returns:
            The root choice node.
        """
        root_node = ChoiceNode(label_name="root", start_line=0)
        is_first_label_appear = False
        index = 0
        
        while index < len(self.lines):
            line = self.lines[index]
            
            label_info = self._is_label(line)
            if label_info[0]:
                if not is_first_label_appear:
                    is_first_label_appear = True
                    temp = ChoiceNode(
                        label_name="INIT",
                        start_line=0,
                        end_line=index - 1,
                        node_type=ChoiceNodeType.LABEL_BLOCK
                    )
                    temp.children.append(
                        ChoiceNode(
                            label_name=self._get_label_name(temp),
                            start_line=0,
                            end_line=index - 1,
                            node_type=ChoiceNodeType.ACTION
                        )
                    )
                    root_node.children.append(temp)
                
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
                
                # Добавляем проверку перед добавлением label_child_node
                if label_child_node.end_line >= label_child_node.start_line:
                    label_child_node.label_name = self._get_label_name(label_child_node)
                    label_node.children.append(label_child_node)
                
                label_child_node.start_line = index
                
                label_node.end_line = index - 1
                root_node.children.append(label_node)
            else:
                # Collect lines before the first label
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
            current_node.children.append(statement_node)
            
            if not temp:
                break
                
            index += 1
            statement_node = ChoiceNode(start_line=index, node_type=ChoiceNodeType.ACTION)
        
        statement_node.end_line = index
        
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
                current_node.false_branch = false_branch_node
                return index
            
            if self._is_else_statement(next_line_trimmed):
                # Parse 'else' as FalseBranch
                false_branch_node = ChoiceNode(start_line=index)
                index = self._parse_statement(index, false_branch_node, current_indent, ChoiceNodeType.ELSE_BLOCK)
                false_branch_node.label_name = self._get_label_name(false_branch_node)
                current_node.false_branch = false_branch_node
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
                trimmed_line.startswith("else") or
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
    
    def _get_label_name(self, node: ChoiceNode) -> str:
        """
        Gets a descriptive label name for a node based on its content.
        
        Args:
            node: The node to get a label name for.
            
        Returns:
            A descriptive label name.
        """
        # If the first line ends with ":", it's a statement declaration
        if (node.start_line < len(self.lines) and 
            self._is_a_statement(self.lines[node.start_line]) and 
            self.lines[node.start_line].endswith(':')):
            return self.lines[node.start_line][:-1].strip()
        
        label_parts = []
        total_lines = node.end_line - node.start_line + 1
        
        if total_lines > 14:
            # Append first 6 non-empty lines
            appended_lines = 0
            for i in range(node.start_line, min(node.end_line + 1, len(self.lines))):
                if not self.lines[i].strip():
                    continue
                label_parts.append(self.lines[i].strip())
                appended_lines += 1
                if appended_lines >= 6:
                    break
            
            # Append the placeholder line
            label_parts.append("<...>")
            
            # Append last 6 non-empty lines
            appended_lines = 0
            for i in range(node.end_line, node.start_line - 1, -1):
                if i >= len(self.lines) or not self.lines[i].strip():
                    continue
                label_parts.append(self.lines[i].strip())
                appended_lines += 1
                if appended_lines >= 6:
                    break
        else:
            for i in range(node.start_line, min(node.end_line + 1, len(self.lines))):
                if not self.lines[i].strip():
                    continue
                label_parts.append(self.lines[i].strip())
        
        return "\n".join(label_parts)