/**
 * Backend selector component for selecting API backend
 */

import { Button, Card, Radio, RadioGroup, Text } from '@ui-kitten/components';
import type React from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ApiProvider, ApiType } from '.';
import { createLogger } from '../services/logger';

interface BackendSelectorProps {
  onSelect: (apiType: ApiType) => void;
  initialType?: ApiType;
  apiProvider: ApiProvider;
}

export const BackendSelector: React.FC<BackendSelectorProps> = ({
  onSelect,
  initialType = 'firebase',
  apiProvider,
}) => {
  const logger = createLogger('BackendSelector');

  // Set initial selected index based on initialType
  const getInitialIndex = () => {
    const apiTypes: ApiType[] = ['firebase'];
    return apiTypes.indexOf(initialType);
  };

  const [selectedIndex, setSelectedIndex] = useState(getInitialIndex());
  const [apiType, setApiType] = useState<ApiType>(initialType);

  // Map numerical index to API type
  useEffect(() => {
    // API type options defined inside useEffect to avoid dependency warnings
    const apiTypes: ApiType[] = ['firebase'];
    const newApiType = apiTypes[selectedIndex];
    setApiType(newApiType);
  }, [selectedIndex]);

  // Handle apply button click
  const handleApply = async () => {
    try {
      logger.info(`Initializing API with type: ${apiType}`);
      await apiProvider.initialize(apiType);
      onSelect(apiType);
    } catch (error) {
      logger.error('Error initializing API:', error);
    }
  };

  return (
    <Card style={styles.card}>
      <Text category="h6" style={styles.title}>
        Select Backend
      </Text>

      <RadioGroup selectedIndex={selectedIndex} onChange={(index) => setSelectedIndex(index)}>
        <Radio>Firebase</Radio>
      </RadioGroup>

      <View style={styles.footer}>
        <Button onPress={handleApply}>Apply</Button>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 10,
    marginHorizontal: 20,
  },
  title: {
    marginBottom: 15,
  },
  footer: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
});
