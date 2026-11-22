// Pengurai XML minimal untuk paste SVG (AD-15): elemen, atribut, dan teks. Murni, tanpa dependensi. Komentar,
// processing instruction, dan DOCTYPE dilewati; CDATA menjadi teks. Entitas standar (&amp; &lt; &gt; &quot; &apos;)
// dan numerik di-decode; entitas lain dibiarkan apa adanya (DTD tidak pernah diproses, jadi tidak ada ekspansi).

export type XmlElement = { name: string; attrs: Map<string, string>; children: XmlNode[] };
export type XmlNode = XmlElement | { text: string };

export class XmlError extends Error {}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
/** Nama XML yang dimulai tepat di `at` (regex sticky: tanpa menyalin sisa string). */
const nameAt = (src: string, at: number): string | undefined => {
  NAME.lastIndex = at;
  return NAME.exec(src)?.[0];
};
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode entitas di teks/atribut; entitas bernama tak dikenal dibiarkan. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);?/g, (all, body: string) => {
    if (!all.endsWith(';')) return all;
    const code = body.startsWith('#x') ? parseInt(body.slice(2), 16) : body.startsWith('#') ? parseInt(body.slice(1), 10) : undefined;
    if (code !== undefined) {
      if (!(code >= 0 && code <= 0x10ffff)) throw new XmlError(`entitas numerik di luar Unicode: ${all}`);
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(ENTITIES, body) ? ENTITIES[body]! : all;
  });
}

/** Urai dokumen XML → elemen akar. Struktur rusak → XmlError dengan posisi. */
export function parseXml(src: string): XmlElement {
  let i = 0;
  const n = src.length;
  const fail = (msg: string): never => {
    throw new XmlError(`${msg} (posisi ${i})`);
  };
  const root: XmlElement = { name: '#document', attrs: new Map(), children: [] };
  const stack: XmlElement[] = [root];
  const top = () => stack[stack.length - 1]!;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      top().children.push({ text: decodeEntities(src.slice(i)) });
      break;
    }
    if (lt > i) top().children.push({ text: decodeEntities(src.slice(i, lt)) });
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) fail('komentar tidak ditutup');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end === -1) fail('CDATA tidak ditutup');
      top().children.push({ text: src.slice(i + 9, end) });
      i = end + 3;
    } else if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end === -1) fail('processing instruction tidak ditutup');
      i = end + 2;
    } else if (src.startsWith('<!', i)) {
      // DOCTYPE (boleh berisi subset internal [...]): dilewati tanpa diproses.
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= n) fail('deklarasi <! tidak ditutup');
      i = j + 1;
    } else if (src.startsWith('</', i)) {
      const name = nameAt(src, i + 2);
      if (!name) return fail('tag penutup tanpa nama');
      const end = src.indexOf('>', i + 2 + name.length);
      if (end === -1 || src.slice(i + 2 + name.length, end).trim()) fail(`tag penutup </${name}> rusak`);
      const open = stack.pop();
      if (!open || open === root || open.name !== name) fail(`tag penutup </${name}> tidak cocok`);
      i = end + 1;
    } else {
      const tag = nameAt(src, i + 1);
      if (!tag) return fail('tag tanpa nama');
      const el: XmlElement = { name: tag, attrs: new Map(), children: [] };
      i += 1 + el.name.length;
      for (;;) {
        while (i < n && /\s/.test(src[i]!)) i++;
        if (i >= n) fail(`tag <${el.name}> tidak ditutup`);
        if (src[i] === '>') {
          i++;
          top().children.push(el);
          stack.push(el);
          break;
        }
        if (src.startsWith('/>', i)) {
          i += 2;
          top().children.push(el);
          break;
        }
        const key = nameAt(src, i);
        if (!key) return fail(`atribut rusak di <${el.name}>`);
        i += key.length;
        while (i < n && /\s/.test(src[i]!)) i++;
        if (src[i] !== '=') fail(`atribut ${key} tanpa nilai`);
        i++;
        while (i < n && /\s/.test(src[i]!)) i++;
        const q = src[i];
        if (q !== '"' && q !== "'") fail(`nilai atribut ${key} harus dikutip`);
        const end = src.indexOf(q!, i + 1);
        if (end === -1) fail(`nilai atribut ${key} tidak ditutup`);
        if (el.attrs.has(key)) fail(`atribut ${key} ganda`);
        el.attrs.set(key, decodeEntities(src.slice(i + 1, end)));
        i = end + 1;
      }
    }
  }
  if (stack.length > 1) throw new XmlError(`tag <${top().name}> tidak ditutup`);
  const elements = root.children.filter((c): c is XmlElement => 'name' in c);
  if (elements.length !== 1) throw new XmlError(elements.length ? 'dokumen punya lebih dari satu elemen akar' : 'tidak ada elemen');
  if (root.children.some((c) => 'text' in c && c.text.trim())) throw new XmlError('teks di luar elemen akar');
  return elements[0]!;
}
