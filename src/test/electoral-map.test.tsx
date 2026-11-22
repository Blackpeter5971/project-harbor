import { render } from '@testing-library/react';
import { it, expect } from 'vitest';
import { UsTileMap } from '@/components/game/electoral-map';
it('renders 51 states', () => { const { container } = render(<UsTileMap states={[{ state: 'Texas', ev: 40, party: 'Republican' }]} />); expect(container.querySelectorAll('.ec-state').length).toBe(51); expect(container.querySelector('.ec-state.rep')).not.toBeNull(); });
