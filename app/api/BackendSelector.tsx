/**
 * Backend selector component for selecting API backend
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Radio, RadioGroup, Text } from '@ui-kitten/components';
import { ApiProvider, ApiType } from './ApiProvider';
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

  // API type options
  const apiTypes: ApiType[] = ['firebase'];

  // Map numerical index to API type
  useEffect(() => {
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
