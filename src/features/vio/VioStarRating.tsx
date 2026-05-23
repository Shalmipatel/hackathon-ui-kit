import React from 'react';
import { Star } from 'lucide-react';
import styled from 'styled-components';

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`;

interface Props {
  rating: number | null | undefined;
}

const VioStarRating: React.FC<Props> = ({ rating }) => {
  if (rating == null) return null;
  return (
    <Wrapper>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={14}
          fill={i < rating ? '#fbbf24' : 'none'}
          color={i < rating ? '#fbbf24' : '#d1d5db'}
        />
      ))}
    </Wrapper>
  );
};

export default VioStarRating;
