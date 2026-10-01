import { codeToHtml } from 'shiki';

type Props = {
  code: string;
  lang?: string;
  label?: string;
  /** Render without the outer frame, e.g. inside another card. */
  bare?: boolean;
};

/** Server-rendered syntax highlighting; no JavaScript is sent to the browser. */
export async function CodeBlock({ code, lang = 'ts', label, bare = false }: Props) {
  const html = await codeToHtml(code.trim(), { lang, theme: 'github-light' });
  const body = <div className="code" dangerouslySetInnerHTML={{ __html: html }} />;
  if (bare) return body;
  return (
    <div className="code-frame">
      {label && (
        <div className="code-label">
          <span>{label}</span>
          <span>{lang === 'ts' ? 'TypeScript' : lang === 'tsx' ? 'React Native' : lang.toUpperCase()}</span>
        </div>
      )}
      {body}
    </div>
  );
}
