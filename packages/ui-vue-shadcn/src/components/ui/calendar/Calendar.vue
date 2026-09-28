<script lang="ts" setup>
import type { CalendarRootEmits, CalendarRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { DateValue } from '@internationalized/date'
import { cn } from '../../../lib/utils'
import { getDayOfWeek } from '@internationalized/date'
import { CalendarRoot, useForwardPropsEmits } from 'reka-ui'
import { computed } from 'vue'
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNextButton,
  CalendarPrevButton,
  CalendarReturnButton,
} from '.'

type CalendarAppearance = 'default' | 'linear'

const props = withDefaults(
  defineProps<
    CalendarRootProps & {
      class?: HTMLAttributes['class']
      appearance?: CalendarAppearance
      returnDate?: DateValue
      returnToSelectedLabel?: string
    }
  >(),
  {
    appearance: 'default',
    returnDate: undefined,
    returnToSelectedLabel: 'Return to today',
  },
)

const emits = defineEmits<CalendarRootEmits>()

const delegatedProps = computed(() => {
  const {
    class: _,
    appearance: __,
    returnDate: ___,
    returnToSelectedLabel: ____,
    ...delegated
  } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
const isLinear = computed(() => props.appearance === 'linear')

function isWeekend(date: DateValue): boolean {
  const weekday = getDayOfWeek(date, 'en-US', 'sun')
  return weekday === 0 || weekday === 6
}

function isWeekendColumn(index: number): boolean {
  if (typeof props.weekStartsOn !== 'number') return false
  const weekday = (props.weekStartsOn + index) % 7
  return weekday === 0 || weekday === 6
}

function isWeekendBlockStart(index: number): boolean {
  return isWeekendColumn(index) && (index === 0 || !isWeekendColumn(index - 1))
}

function isWeekendBlockEnd(index: number): boolean {
  return isWeekendColumn(index) && (index === 6 || !isWeekendColumn(index + 1))
}
</script>

<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    :class="cn(isLinear ? 'p-0' : 'p-3', props.class)"
    v-bind="forwarded"
  >
    <CalendarHeader :class="isLinear ? 'justify-start pt-0' : undefined">
      <template v-if="isLinear">
        <CalendarHeading class="mr-auto text-[13px] font-semibold tracking-[-0.01em] text-foreground/90" />
        <CalendarReturnButton :date="returnDate" :label="returnToSelectedLabel" />
        <CalendarPrevButton
          class="h-6 w-6 border-0 bg-transparent p-0 shadow-none opacity-55 hover:bg-accent/70 hover:opacity-100"
        />
        <CalendarNextButton
          class="h-6 w-6 border-0 bg-transparent p-0 shadow-none opacity-55 hover:bg-accent/70 hover:opacity-100"
        />
      </template>

      <template v-else>
        <CalendarPrevButton />
        <CalendarHeading />
        <CalendarNextButton />
      </template>
    </CalendarHeader>

    <div
      :class="
        cn(
          isLinear
            ? 'mt-4 flex flex-col gap-y-0'
            : 'mt-4 flex flex-col gap-y-4 sm:flex-row sm:gap-x-4 sm:gap-y-0',
        )
      "
    >
      <CalendarGrid v-for="month in grid" :key="month.value.toString()">
        <CalendarGridHead>
          <CalendarGridRow :class="isLinear ? 'w-full' : undefined">
            <CalendarHeadCell
              v-for="(day, dayIndex) in weekDays"
              :key="day"
              :class="
                isLinear
                  ? cn(
                      'h-7 flex-1 text-[11px] font-normal text-muted-foreground/70',
                      isWeekendColumn(dayIndex) && 'bg-[hsl(var(--selected))] text-muted-foreground',
                      isWeekendBlockStart(dayIndex) && 'rounded-tl-lg',
                      isWeekendBlockEnd(dayIndex) && 'rounded-tr-lg',
                    )
                  : undefined
              "
            >
              {{ day }}
            </CalendarHeadCell>
          </CalendarGridRow>
        </CalendarGridHead>

        <CalendarGridBody>
          <CalendarGridRow
            v-for="(weekDates, index) in month.rows"
            :key="`weekDate-${index}`"
            :class="isLinear ? 'w-full' : 'mt-2 w-full'"
          >
            <CalendarCell
              v-for="(weekDate, dayIndex) in weekDates"
              :key="weekDate.toString()"
              :date="weekDate"
              :class="
                isLinear
                  ? cn(
                      'flex h-[34px] flex-1 items-center justify-center rounded-none [&:has([data-selected])]:bg-transparent [&:has([data-selected][data-outside-view])]:bg-transparent',
                      isWeekend(weekDate) &&
                        'bg-[hsl(var(--selected))] [&:has([data-selected])]:bg-[hsl(var(--selected))] [&:has([data-selected][data-outside-view])]:bg-[hsl(var(--selected))]',
                      index === month.rows.length - 1 &&
                        isWeekendBlockStart(dayIndex) &&
                        'rounded-bl-lg',
                      index === month.rows.length - 1 &&
                        isWeekendBlockEnd(dayIndex) &&
                        'rounded-br-lg',
                    )
                  : undefined
              "
            >
              <CalendarCellTrigger
                :day="weekDate"
                :month="month.value"
                :class="
                  isLinear
                    ? cn(
                        'mx-auto h-7 w-7 rounded-md p-0 text-[12px] font-normal shadow-none hover:bg-accent/75 hover:text-foreground',
                        isWeekend(weekDate) && 'text-muted-foreground/90',
                        '[&[data-outside-view]]:opacity-35',
                        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-30 data-[disabled]:hover:bg-transparent data-[disabled]:hover:text-muted-foreground',
                        '[&[data-today]:not([data-selected])]:bg-accent/80',
                        '[&[data-today]:not([data-selected])]:font-medium',
                        '[&[data-today]:not([data-selected])]:text-foreground',
                        '[&[data-today]:not([data-selected])]:ring-1',
                        '[&[data-today]:not([data-selected])]:ring-primary/45',
                        'data-[selected]:rounded-full',
                        'data-[selected]:bg-primary',
                        'data-[selected]:text-primary-foreground',
                        'data-[selected]:hover:bg-primary',
                        'data-[selected]:hover:text-primary-foreground',
                      )
                    : undefined
                "
              />
            </CalendarCell>
          </CalendarGridRow>
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  </CalendarRoot>
</template>
