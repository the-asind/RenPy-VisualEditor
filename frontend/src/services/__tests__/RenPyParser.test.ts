import { describe, it, expect } from 'vitest';
import { RenPyParser, ChoiceNode } from '../RenPyParser';
import goldenData from '../../tests/fixtures/golden.json';

function cleanNode(node: ChoiceNode): any {
    const obj: any = {
        node_type: node.node_type,
        label_name: node.label_name,
        start_line: node.start_line,
        end_line: node.end_line,
        children: node.children.map(cleanNode)
    };

    if (node.false_branch && node.false_branch.length > 0) {
        obj.false_branch = node.false_branch.map(cleanNode);
    }

    return obj;
}

describe('RenPyParser', () => {
    const parser = new RenPyParser();

    Object.entries(goldenData).forEach(([caseName, data]: [string, any]) => {
        it(`should match golden data for case: ${caseName}`, () => {
            const result = parser.parse(data.content);
            const cleanedResult = cleanNode(result);

            // Remove IDs from golden data for comparison (just in case)
            const cleanGolden = (node: any): any => {
                const { id, ...rest } = node;
                if (rest.children) rest.children = rest.children.map(cleanGolden);
                if (rest.false_branch) rest.false_branch = rest.false_branch.map(cleanGolden);
                return rest;
            };

            const expected = cleanGolden(data.tree);

            expect(cleanedResult).toEqual(expected);
        });
    });
});
