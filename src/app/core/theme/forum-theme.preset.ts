import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const ForumThemePreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '12px',
      xl: '16px',
    },
  },
  semantic: {
    primary: {
      50: '#F8E6F5',
      100: '#EBD0E7',
      200: '#D7A7D1',
      300: '#C07DB8',
      400: '#9B5B9E',
      500: '#714EA0',
      600: '#7F50A0',
      700: '#5E3A7E',
      800: '#482B61',
      900: '#341E47',
      950: '#21122E',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.500}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.700}',
          focusColor: '{primary.800}',
        },
      },
      dark: {
        primary: {
          color: '{primary.400}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        highlight: {
          background: '{primary.900}',
          focusBackground: '{primary.800}',
          color: '{primary.50}',
          focusColor: '{primary.100}',
        },
      },
    },
  },
  components: {
    card: {
      root: {
        borderRadius: '16px',
      },
    },
    button: {
      root: {
        borderRadius: '9999px',
      },
    },
  },
});
