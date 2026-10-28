import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BarChartItem {
  label: string;
  value: number;
}

export interface BarLayout {
  height: number;
  y: number;
  negative: boolean;
  baselineY: number;
}

/**
 * Pure bar layout computation.
 * For positive values, bar starts at baseline - height.
 * For negative values, bar starts at baseline and extends down by height.
 */
export function layoutBars(values: number[], plotHeight: number): BarLayout[] {
  if (!values || values.length === 0) return [];
  const maxVal = Math.max(0, ...values);
  const minVal = Math.min(0, ...values);
  const span = maxVal - minVal;

  if (span === 0) {
    return values.map(() => ({
      height: 0,
      y: plotHeight,
      negative: false,
      baselineY: plotHeight,
    }));
  }

  const baselineY = Math.round((plotHeight * maxVal) / span);

  return values.map((v) => {
    const isNeg = v < 0;
    const h = Math.round((plotHeight * Math.abs(v)) / span);
    const y = isNeg ? baselineY : baselineY - h;
    return {
      height: h,
      y,
      negative: isNeg,
      baselineY,
    };
  });
}

@Component({
  selector: 'app-svg-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (chartLayout(); as layout) {
      <div class="overflow-x-auto" tabindex="0" role="region" [attr.aria-label]="ariaLabel()">
        <div class="min-w-[360px]">
          <svg
            [attr.viewBox]="'0 0 ' + layout.width + ' ' + plotHeight()"
            [attr.height]="plotHeight()"
            preserveAspectRatio="none"
            class="block w-full"
            role="img"
            [attr.aria-label]="ariaLabel()"
          >
            <!-- Baseline -->
            <line
              x1="0"
              [attr.y1]="layout.baselineY"
              [attr.x2]="layout.width"
              [attr.y2]="layout.baselineY"
              class="stroke-surface-300"
              stroke-width="1"
            />

            <!-- Bars -->
            @for (bar of layout.bars; track bar.label) {
              <rect
                [attr.x]="bar.x"
                [attr.y]="bar.y"
                [attr.width]="bar.width"
                [attr.height]="bar.height"
                [class]="bar.negative ? 'fill-surface-400' : 'fill-primary-600'"
                rx="2"
              >
                <title>{{ bar.label }}: {{ valueLabel()(bar.value) }}</title>
              </rect>
            }
          </svg>
          <div class="relative h-9 mt-3 text-[11px] text-surface-500">
            @for (label of layout.labels; track label.label; let first = $first; let last = $last) {
              <span
                data-chart-label
                class="absolute whitespace-nowrap"
                [style.left.%]="first ? 0 : last ? null : label.position"
                [style.right.px]="last && !first ? 0 : null"
                [style.transform]="!first && !last ? 'translateX(-50%)' : null"
                >{{ label.label }}</span
              >
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SvgBarChartComponent {
  readonly items = input<BarChartItem[]>([]);
  readonly plotHeight = input<number>(120);
  readonly ariaLabel = input<string>('');
  readonly valueLabel = input<(value: number) => string>((value) => String(value));

  protected readonly chartLayout = computed(() => {
    const items = this.items();
    const h = this.plotHeight();
    const values = items.map((i) => i.value);
    const layouts = layoutBars(values, h);
    if (items.length === 0) {
      return { width: 360, height: h + 30, baselineY: h, bars: [], labels: [] };
    }
    const barWidth = 32;
    const gap = 16;
    const padding = 20;
    const width = Math.max(240, padding * 2 + items.length * barWidth + (items.length - 1) * gap);
    const baselineY = layouts[0]?.baselineY ?? h;
    const bars = items.map((item, idx) => {
      const layout = layouts[idx];
      const x = padding + idx * (barWidth + gap);
      return {
        label: item.label,
        value: item.value,
        x,
        y: layout.y,
        width: barWidth,
        height: layout.height,
        negative: layout.negative,
        labelX: x + barWidth / 2,
      };
    });
    return {
      width,
      height: h + 30,
      baselineY,
      bars,
      // Keep date labels readable for a 30/93-day range. Full dates and exact values remain on
      // every bar's title and in the period table; axis text is HTML so the SVG cannot shrink it.
      labels: bars
        .filter(
          (_, idx) =>
            idx % Math.max(1, Math.ceil((bars.length - 1) / 4)) === 0 || idx === bars.length - 1,
        )
        .map((bar) => ({ label: bar.label, position: (bar.labelX / width) * 100 })),
    };
  });
}
