import { describe, it, expect } from 'vitest';
import { extractNodeMetadata, parseMetadataComment, formatMetadataComment, NODE_METADATA_PREFIX } from '../nodeMetadata';

describe('nodeMetadata', () => {
    it('parses offset correctly', () => {
        const line = `${NODE_METADATA_PREFIX} offset="100,200"`;
        const metadata = parseMetadataComment(line);
        expect(metadata.offset).toEqual({ x: 100, y: 200 });
    });

    it('formats offset correctly', () => {
        const metadata = { offset: { x: 50.5, y: -10 } };
        const comment = formatMetadataComment(metadata);
        expect(comment).toContain('offset="51,-10"'); // Rounds values
    });

    it('extracts offset from script lines', () => {
        const lines = [
            'label start:',
            '    # @NODE offset="10,20"',
            '    "Hello"'
        ];
        const node = { start_line: 1, end_line: 2 }; // The action node
        const metadata = extractNodeMetadata(lines, node);
        expect(metadata.offset).toEqual({ x: 10, y: 20 });
    });
});
