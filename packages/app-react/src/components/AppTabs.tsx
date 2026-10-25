import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePathname, useRouter } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import {
  BottomTabInset,
  PrimaryButton,
  Spacing,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

type RootNavItem = {
  name: string;
  href: '/' | '/tasks' | '/goals' | '/schedule' | '/explore';
  label: string;
  description: string;
  match: (pathname: string) => boolean;
};

const ROOT_NAV_ITEMS: RootNavItem[] = [
  {
    name: 'index',
    href: '/',
    label: 'Home',
    description: '首页总览和当天摘要。',
    match: (pathname) => pathname === '/',
  },
  {
    name: 'tasks',
    href: '/tasks',
    label: 'Tasks',
    description: '任务模板、详情和编辑流。',
    match: (pathname) => pathname.startsWith('/tasks'),
  },
  {
    name: 'goals',
    href: '/goals',
    label: 'Goals',
    description: '目标列表、关键结果和 review。',
    match: (pathname) => pathname.startsWith('/goals'),
  },
  {
    name: 'schedule',
    href: '/schedule',
    label: 'Schedule',
    description: '日程、周视图、月历和事件编辑。',
    match: (pathname) => pathname.startsWith('/schedule'),
  },
  {
    name: 'explore',
    href: '/explore',
    label: 'More',
    description: '仓库、提醒、AI、通知和设置。',
    match: (pathname) => pathname.startsWith('/explore'),
  },
];

export default function AppTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const activeItem = useMemo(
    () => ROOT_NAV_ITEMS.find((item) => item.match(pathname)) ?? ROOT_NAV_ITEMS[0],
    [pathname],
  );

  function handleNavigate(href: RootNavItem['href']) {
    setIsMenuOpen(false);
    router.replace(href);
  }

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />

      <TabList style={styles.hiddenTabList}>
        {ROOT_NAV_ITEMS.map((item) => (
          <TabTrigger key={item.name} href={item.href} name={item.name} />
        ))}
      </TabList>

      {isMenuOpen ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsMenuOpen(false)}
          style={styles.backdrop}
        />
      ) : null}

      <View pointerEvents="box-none" style={styles.overlayLayer}>
        {isMenuOpen ? (
          <ThemedView
            type="backgroundElement"
            style={[
              styles.menuSheet,
              { bottom: insets.bottom + BottomTabInset + Spacing.two + 68 },
            ]}
          >
            <View style={styles.menuHeader}>
              <View style={styles.menuCopy}>
                <ThemedText type="smallBold">Navigate</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  底部只保留一个全局入口，页面跳转集中在这里。
                </ThemedText>
              </View>
              <PrimaryButton label="Close" onPress={() => setIsMenuOpen(false)} variant="ghost" />
            </View>

            <View style={styles.menuList}>
              {ROOT_NAV_ITEMS.map((item) => {
                const isActive = item.href === activeItem.href;

                return (
                  <Pressable
                    key={item.href}
                    accessibilityRole="button"
                    onPress={() => handleNavigate(item.href)}
                    style={({ pressed }) => [pressed ? styles.menuPressed : null]}
                  >
                    <ThemedView
                      type={isActive ? 'backgroundSelected' : 'background'}
                      style={styles.menuItem}
                    >
                      <View style={styles.menuItemHeader}>
                        <ThemedText type="smallBold">{item.label}</ThemedText>
                        {isActive ? (
                          <ThemedText type="small" themeColor="tint">
                            Current
                          </ThemedText>
                        ) : null}
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.description}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>
        ) : null}

        <View style={[styles.bottomLauncherWrap, { paddingBottom: insets.bottom + Spacing.two }]}>
          <ThemedView type="backgroundElement" style={styles.bottomLauncher}>
            <View style={styles.bottomCopy}>
              <ThemedText type="small" themeColor="textSecondary">
                Current section
              </ThemedText>
              <ThemedText type="smallBold">{activeItem.label}</ThemedText>
            </View>

            <PrimaryButton
              label={isMenuOpen ? 'Close menu' : 'Menu'}
              onPress={() => setIsMenuOpen((current) => !current)}
              variant="secondary"
            />
          </ThemedView>
        </View>
      </View>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  hiddenTabList: {
    width: 0,
    height: 0,
    opacity: 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 20, 28, 0.24)',
  },
  overlayLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  menuSheet: {
    position: 'absolute',
    right: Spacing.three,
    left: Spacing.three,
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  menuCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  menuList: {
    gap: Spacing.two,
  },
  menuItem: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  menuItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  menuPressed: {
    opacity: 0.82,
  },
  bottomLauncherWrap: {
    paddingHorizontal: Spacing.three,
  },
  bottomLauncher: {
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bottomCopy: {
    gap: Spacing.half,
  },
});
