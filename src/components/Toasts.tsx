import { Toast } from '@base-ui/react/toast';
import * as stylex from '@stylexjs/stylex';

import toastManager from '../lib/toast-manager';

export default function Toasts() {
  return (
    <Toast.Provider toastManager={toastManager} timeout={4000} limit={10}>
      <Toast.Portal>
        <Toast.Viewport {...stylex.props(styles.viewport)}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      {...stylex.props(
        styles.toast,
        typeVariantsStyles[toast.type as keyof typeof typeVariantsStyles] ??
          typeVariantsStyles['info'],
      )}
    >
      {toast.title}
    </Toast.Root>
  ));
}

const styles = stylex.create({
  viewport: {
    position: 'fixed',
    bottom: '43px',
    right: '10px',
    width: '250px',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    rowGap: '10px',
    columnGap: '10px',
  },
  toast: {
    borderStyle: 'solid',
    borderWidth: '1px',
    borderLeftWidth: '5px',
    backgroundColor: 'var(--bg)',
    borderTopColor: 'var(--border)',
    borderRightColor: 'var(--border)',
    borderBottomColor: 'var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    padding: '1rem',
  },
});

const typeVariantsStyles = stylex.create({
  success: {
    borderLeftColor: 'var(--success)',
  },
  info: {
    borderLeftColor: 'var(--info)',
  },
  warning: {
    borderLeftColor: 'var(--warn)',
  },
  danger: {
    borderLeftColor: 'var(--danger)',
  },
});

export type ToastType = keyof typeof typeVariantsStyles;
