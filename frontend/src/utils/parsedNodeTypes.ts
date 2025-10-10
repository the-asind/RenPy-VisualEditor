export interface ParsedNodeData {
  id?: string;
  node_type?: string;
  label_name?: string;
  content?: string | string[];
  start_line?: number;
  end_line?: number;
  next_id?: string;
  condition?: string;
  children?: ParsedNodeData[];
  false_branch?: ParsedNodeData[];
  [key: string]: any;
}
