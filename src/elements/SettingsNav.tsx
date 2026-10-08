import { NavigationMenu } from '@base-ui/react/navigation-menu';
import * as stylex from '@stylexjs/stylex';
import { Link } from '@tanstack/react-router';
import type React from 'react';

interface WrapProps {
  children: React.ReactNode;
}

/**
 * Wrapper for navigation
 */
export function SettingsNav(props: WrapProps) {
  return (
    <NavigationMenu.Root orientation="vertical">
      <NavigationMenu.List {...stylex.props(styles.nav)}>
        {props.children}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}

interface LinkProps {
  children: React.ReactNode;
  to: string;
}

/**
 * Single navigation item (anchor)
 */
export function SettingsNavLink(props: LinkProps) {
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Link
        render={(renderProps) => (
          <Link
            to={props.to}
            draggable={false}
            {...renderProps}
            {...stylex.props(styles.link)}
          >
            {props.children}
          </Link>
        )}
      />
    </NavigationMenu.Item>
  );
}

const styles = stylex.create({
  nav: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (max-width: 560px)': 'row',
    },
    flexWrap: 'wrap',
    rowGap: 'var(--space-1)',
    columnGap: 'var(--space-1)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    minWidth: 0,
  },
  link: {
    display: 'inline-block',
    fontSize: 'var(--text-sm)',
    fontWeight: {
      default: 'var(--weight-medium)',
      ':is([data-status="active"])': 'var(--weight-semibold)',
    },
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    textDecorationLine: 'none',
    minHeight: 'var(--row-compact)',
    lineHeight: 'var(--row-compact)',
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 'var(--space-3)',
    paddingRight: 'var(--space-3)',
    borderRadius: 'var(--radius)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
      ':is([data-status="active"])': 'var(--accent-soft)',
    },
    boxShadow: {
      default: 'none',
      ':is([data-status="active"])': 'var(--glow-hover)',
    },
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text)',
      ':is([data-status="active"])': 'var(--accent-text)',
    },
  },
});
