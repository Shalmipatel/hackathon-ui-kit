import React from 'react';

interface VioErrorBoundaryProps {
  children: React.ReactNode;
}

interface VioErrorBoundaryState {
  hasError: boolean;
}

export class VioErrorBoundary extends React.Component<
  VioErrorBoundaryProps,
  VioErrorBoundaryState
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[VioHotelSearch] Render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 12,
            fontSize: 13,
            color: '#71717a',
            background: '#f4f4f5',
            borderRadius: 8,
          }}
        >
          Failed to render hotel results. Try refreshing.
        </div>
      );
    }
    return this.props.children;
  }
}

export default VioErrorBoundary;
