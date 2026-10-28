import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { SvgBarChartComponent, layoutBars } from './svg-bar-chart.component';

describe('SvgBarChartComponent and layoutBars', () => {
  describe('layoutBars pure function', () => {
    it('computes correct heights and positions for all non-negative values', () => {
      const bars = layoutBars([165000, 45000, 0, 80000], 120);
      expect(bars.map((b) => b.height)).toEqual([120, 33, 0, 58]);
      expect(bars.every((b) => b.negative === false)).toBe(true);
      // all starting from same baseline (y = 120 - height)
      expect(bars.map((b) => b.y)).toEqual([0, 87, 120, 62]);
      expect(bars.every((b) => b.baselineY === 120)).toBe(true);
    });

    it('computes correct baseline and negative bar positions for mixed values', () => {
      const bars = layoutBars([100, -50], 120);
      expect(bars.map((b) => b.height)).toEqual([80, 40]);
      expect(bars[0].y).toBe(0);
      expect(bars[0].negative).toBe(false);
      expect(bars[1].y).toBe(80);
      expect(bars[1].negative).toBe(true);
      expect(bars.every((b) => b.baselineY === 80)).toBe(true);
    });

    it('handles all zeros safely without NaN', () => {
      const bars = layoutBars([0, 0], 120);
      expect(bars.length).toBe(2);
      expect(bars.map((b) => b.height)).toEqual([0, 0]);
      expect(bars.every((b) => !Number.isNaN(b.height) && !Number.isNaN(b.y))).toBe(true);
    });

    it('handles empty array returning empty layout', () => {
      expect(layoutBars([], 120)).toEqual([]);
    });
  });

  describe('Component DOM rendering', () => {
    let fixture: ComponentFixture<SvgBarChartComponent>;
    let component: SvgBarChartComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [SvgBarChartComponent],
      }).compileComponents();

      fixture = TestBed.createComponent(SvgBarChartComponent);
      component = fixture.componentInstance;
    });

    it('keeps every bar and exact value for a long range while using a readable subset of date labels', () => {
      const items = Array.from({ length: 93 }, (_, index) => ({
        label: `Period ${index + 1}`,
        value: index % 2 === 0 ? index * 100 : -index * 100,
      }));
      fixture.componentRef.setInput('items', items);
      fixture.componentRef.setInput('valueLabel', (value: number) => `Value ${value}`);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('rect')).toHaveLength(93);
      const labels = el.querySelectorAll('[data-chart-label]');
      expect(labels.length).toBeLessThanOrEqual(6);
      expect(labels[0].textContent).toContain('Period 1');
      expect(labels[labels.length - 1].textContent).toContain('Period 93');
      expect(el.querySelectorAll('rect title')[1].textContent).toContain('Period 2: Value -100');
      expect(el.querySelector('svg')?.getAttribute('height')).toBe('120');
    });

    it('renders one rect per bar with role="img", aria-label, fill classes and text labels', () => {
      fixture.componentRef.setInput('items', [
        { label: '2026-10-23', value: 100 },
        { label: '2026-10-24', value: -50 },
      ]);
      fixture.componentRef.setInput('plotHeight', 120);
      fixture.componentRef.setInput('ariaLabel', 'Earned revenue trend chart');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const svg = el.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('role')).toBe('img');
      expect(svg?.getAttribute('aria-label')).toBe('Earned revenue trend chart');

      const rects = el.querySelectorAll('rect');
      expect(rects.length).toBe(2);
      expect(rects[0].classList.contains('fill-primary-600')).toBe(true);
      expect(rects[1].classList.contains('fill-surface-400')).toBe(true);

      const baseline = el.querySelector('line');
      expect(baseline).toBeTruthy();
      expect(baseline?.classList.contains('stroke-surface-300')).toBe(true);

      const texts = el.querySelectorAll('[data-chart-label]');
      expect(texts.length).toBeGreaterThanOrEqual(2);
      const textContent = Array.from(texts)
        .map((t) => t.textContent?.trim())
        .join(' ');
      expect(textContent).toContain('2026-10-23');
      expect(textContent).toContain('2026-10-24');
      expect(svg?.getAttribute('preserveAspectRatio')).toBe('none');
      expect(rects[0].querySelector('title')?.textContent).toContain('2026-10-23: 100');

      // Check no style attribute holds color
      for (const node of el.querySelectorAll('*')) {
        const style = node.getAttribute('style');
        if (style) {
          expect(style).not.toMatch(/color|fill|stroke|background/);
        }
      }
    });
  });
});
