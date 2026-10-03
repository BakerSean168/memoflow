import { cleanup, render } from '@testing-library/vue';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { Popover, PopoverContent } from '../components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  sheetVariants,
} from '../components/ui/sheet';
import { dialogContentMotionClass, dialogOverlayMotionClass, reducedMotionClass } from './motion';

afterEach(cleanup);

describe('overlay reduced-motion recipes', () => {
  it('disables both opening and closing animations on Dialog and every Sheet side', () => {
    for (const recipe of [
      dialogContentMotionClass,
      dialogOverlayMotionClass,
      ...(['left', 'right', 'top', 'bottom'] as const).map((side) => sheetVariants({ side })),
    ]) {
      expect(recipe).toContain('motion-reduce:data-[state=open]:animate-none');
      expect(recipe).toContain('motion-reduce:data-[state=closed]:animate-none');
    }
    expect(reducedMotionClass).toContain('motion-reduce:transition-none');
  });

  it('applies the reduced-motion recipe to rendered Popover content', async () => {
    const view = render(
      defineComponent({
        setup: () => () => h(Popover, { open: true }, { default: () => h(PopoverContent) }),
      }),
    );

    const content = await view.findByRole('dialog');
    for (const className of reducedMotionClass.split(' ')) {
      expect(content.classList.contains(className)).toBe(true);
    }
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)(
    'applies the expected motion recipes to the rendered %s Sheet backdrop and content',
    async (side) => {
      const view = render(
        defineComponent({
          setup: () => () =>
            h(
              Sheet,
              { open: true },
              {
                default: () =>
                  h(
                    SheetContent,
                    { side },
                    {
                      default: () => [
                        h(SheetTitle, {}, { default: () => 'Motion test sheet' }),
                        h(SheetDescription, {}, { default: () => 'Reduced-motion coverage' }),
                      ],
                    },
                  ),
              },
            ),
        }),
      );

      const content = await view.findByRole('dialog', { name: 'Motion test sheet' });
      const backdrop = document.body.querySelector('[data-state="open"].inset-0');
      expect(backdrop).not.toBeNull();
      for (const className of dialogOverlayMotionClass.split(' ')) {
        expect(backdrop?.classList.contains(className)).toBe(true);
      }
      for (const className of sheetVariants({ side }).split(' ')) {
        expect(content.classList.contains(className)).toBe(true);
      }
    },
  );
});
