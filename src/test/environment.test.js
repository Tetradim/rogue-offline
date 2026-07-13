import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('provides a browser document with DOM matchers', () => {
    const div = document.createElement('div');
    div.textContent = 'PokéRogue Mod Studio';
    document.body.append(div);

    expect(document.body).toHaveTextContent('PokéRogue Mod Studio');
  });
});
