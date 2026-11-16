import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DatesPanel } from './dates-panel';
import { initialSelection } from './search-state';

describe('DatesPanel', () => {
  it('renders inclusive dates without making up pickup times', () => {
    const start = new Date();
    start.setDate(start.getDate() + 10);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const formatLocalDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const startDate = formatLocalDate(start);
    const endDate = formatLocalDate(end);
    const expectedStartLabel = new Intl.DateTimeFormat('fr', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${startDate}T12:00:00Z`));
    const html = renderToStaticMarkup(
      <DatesPanel
        locale="fr"
        selection={{ ...initialSelection(), startDate, endDate }}
        onChange={() => {}}
        onDone={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Durée de location"');
    expect(html).toContain('Moins d’un jour');
    expect(html).toContain('Un jour ou plus');
    expect(html).toContain('aria-label="Dates flexibles"');
    expect(html).toContain('± 14 jours');
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain('type="time"');
    expect(html).toContain(`aria-label="${expectedStartLabel}"`);
  });

  it('keeps both optional time inputs empty until the user chooses their hours', () => {
    const html = renderToStaticMarkup(
      <DatesPanel
        locale="en"
        selection={{ ...initialSelection(), withTimes: true }}
        onChange={() => {}}
        onDone={() => {}}
      />,
    );
    expect(html.match(/type="time"/g)).toHaveLength(2);
    expect(html).toContain('Choose a date, then your times.');
    expect(html).not.toContain('value="09:00"');
  });

  it('shows one month for a short rental and two for an existing day range', () => {
    const render = (withTimes: boolean) =>
      renderToStaticMarkup(
        <DatesPanel
          locale="fr"
          selection={{
            ...initialSelection(),
            startDate: '2027-09-12',
            endDate: '2027-09-13',
            withTimes,
          }}
          onChange={() => {}}
          onDone={() => {}}
        />,
      );
    expect(render(true)).toContain('aria-label="septembre 2027"');
    expect(render(true)).not.toContain('aria-label="octobre 2027"');
    expect(render(false)).toContain('aria-label="octobre 2027"');
    expect(render(false)).toContain('Appliquer');
  });

  it('does not crash when a user types the last supported calendar month', () => {
    expect(() =>
      renderToStaticMarkup(
        <DatesPanel
          locale="fr"
          selection={{ ...initialSelection(), startDate: '9999-12-01', endDate: '9999-12-31' }}
          onChange={() => {}}
          onDone={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
