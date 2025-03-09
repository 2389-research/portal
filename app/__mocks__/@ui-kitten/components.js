/**
 * Mock implementation for @ui-kitten/components
 */

import React from 'react';
import { Text as RNText, TextInput, View } from 'react-native';

// Create basic mock components that render their children
const createMockComponent = (displayName) => {
  const Component = ({ children, style, ...props }) => (
    <View testID={displayName} style={style} {...props}>
      {children}
    </View>
  );
  Component.displayName = displayName;
  return Component;
};

// Mock text component with basic styling
const Text = ({ children, style, category, ...props }) => (
  <RNText testID="UIKittenText" style={style} {...props}>
    {children}
  </RNText>
);

// Mock input component
const Input = ({ style, placeholder, onChangeText, disabled, ...props }) => (
  <TextInput
    testID="UIKittenInput"
    style={style}
    placeholder={placeholder}
    onChangeText={onChangeText}
    editable={!disabled}
    disabled={disabled}
    {...props}
  />
);

// Mock button component
const Button = ({ onPress, children, ...props }) => (
  <View testID="UIKittenButton" onTouchEnd={onPress} {...props}>
    {typeof children === 'string' ? <RNText>{children}</RNText> : children}
  </View>
);

// Mock card component
const Card = createMockComponent('UIKittenCard');

// Mock divider component
const Divider = createMockComponent('UIKittenDivider');

// Export mock components
export { Text, Input, Button, Card, Divider };

// Default export for imports like: import * as UIKitten from '@ui-kitten/components'
export default {
  Text,
  Input,
  Button,
  Card,
  Divider,
};
