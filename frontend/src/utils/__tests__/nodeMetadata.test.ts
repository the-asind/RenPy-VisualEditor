import { describe, it, expect } from 'vitest';
import { parseMetadataComment, formatMetadataComment, NODE_METADATA_PREFIX } from '../nodeMetadata';

describe('Node Metadata Utilities', () => {
  it('parses offset from metadata string', () => {
    const metadataString = `${NODE_METADATA_PREFIX} offset="100,200"`;
    const metadata = parseMetadataComment(metadataString);
    expect(metadata.offset).toBeDefined();
    expect(metadata.offset).toEqual({ x: 100, y: 200 });
  });

  it('parses offset with other attributes', () => {
    const metadataString = `${NODE_METADATA_PREFIX} name="Test Node" offset="-50.5, 75.2" status="Done"`;
    const metadata = parseMetadataComment(metadataString);
    expect(metadata.name).toBe("Test Node");
    expect(metadata.status).toBe("Done");
    expect(metadata.offset).toEqual({ x: -50.5, y: 75.2 });
  });

  it('formats metadata with offset', () => {
    const metadata = {
      name: "My Node",
      offset: { x: 123, y: 456 }
    };
    const formatted = formatMetadataComment(metadata);
    expect(formatted).toContain('name="My Node"');
    expect(formatted).toContain('offset="123,456"');
    expect(formatted).toMatch(/^# @NODE/);
  });

  it('handles rounding in format', () => {
    const metadata = {
      offset: { x: 10.123, y: 20.89 }
    };
    const formatted = formatMetadataComment(metadata);
    expect(formatted).toContain('offset="10,21"');
  });
});
