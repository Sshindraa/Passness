import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PassnessBrand } from './passness-brand';

describe('PassnessBrand', () => {
  it('renders the supplied logo as a decorative image inside an accessible home link', () => {
    const html = renderToStaticMarkup(
      <PassnessBrand href="/" ariaLabel="Passness, accueil" logoClassName="logo" />,
    );
    expect(html).toMatch(/<a[^>]*aria-label="Passness, accueil"[^>]*>/);
    expect(html).toContain('passness-logo.svg');
    expect(html).toContain('alt=""');
    expect(html).toContain('>passness</span>');
  });

  it('keeps product-area suffixes alongside the same logo', () => {
    const html = renderToStaticMarkup(
      <PassnessBrand href="/dashboard/org" ariaLabel="Passness Pro, accueil" suffix="Pro" />,
    );
    expect(html).toContain('passness <em>Pro</em>');
  });
});
