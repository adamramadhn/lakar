// Pengurai XML minimal paste SVG: entitas, komentar, CDATA, DOCTYPE, dan struktur rusak.
import { describe, expect, it } from 'vitest';
import { XmlError, decodeEntities, parseXml } from './xml.js';

describe('parseXml', () => {
  it('elemen, atribut (kutip tunggal/ganda), self-closing, teks, CDATA; komentar/PI/DOCTYPE dilewati', () => {
    const el = parseXml(`\uFEFF`.slice(1) + `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "b">]><!-- x --><svg a="1" b='2'><g><path d="M0 0"/></g>t&amp;<![CDATA[<raw>]]></svg>`);
    expect(el.name).toBe('svg');
    expect([...el.attrs]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    const g = el.children[0] as { name: string; children: { name: string; attrs: Map<string, string> }[] };
    expect(g.name).toBe('g');
    expect(g.children[0]!.attrs.get('d')).toBe('M0 0');
    expect(el.children.slice(1)).toEqual([{ text: 't&' }, { text: '<raw>' }]);
  });

  it('entitas standar dan numerik; entitas tak dikenal dibiarkan; tidak ada lookup prototipe', () => {
    expect(decodeEntities('&lt;&gt;&quot;&apos;&amp;&#65;&#x42;&nbsp;&constructor; & x')).toBe(`<>"'&AB&nbsp;&constructor; & x`);
    expect(() => decodeEntities('&#x110000;')).toThrow(XmlError);
  });

  it('struktur rusak → XmlError', () => {
    for (const bad of ['<svg>', '<svg></g>', '<svg a=1/>', '<svg a="1" a="2"/>', '<svg/><svg/>', 'teks', '<svg/>x', '<!-- x', '<svg a="1/>', '</svg>']) {
      expect(() => parseXml(bad), bad).toThrow(XmlError);
    }
  });
});
