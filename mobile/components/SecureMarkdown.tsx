import React, { useMemo } from 'react';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

import { constrainMarkdownForDisplay, isSafeMarkdownLink } from '@/utils/secureMarkdown';

const hardenedParser = MarkdownIt({
  typographer: true,
  linkify: false,
}).disable(['image']);

type SecureMarkdownProps = {
  children: string;
  style?: Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export default function SecureMarkdown({ children, style }: SecureMarkdownProps) {
  const constrained = useMemo(() => constrainMarkdownForDisplay(children), [children]);
  const complexityLimits = {
    maxTopLevelChildren: 200,
    allowedImageHandlers: [] as string[],
    defaultImageHandler: null,
  };

  return (
    <Markdown
      {...complexityLimits}
      markdownit={hardenedParser}
      onLinkPress={isSafeMarkdownLink}
      style={style}
    >
      {constrained}
    </Markdown>
  );
}
