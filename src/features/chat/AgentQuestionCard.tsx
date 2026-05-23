import React, { useState, useCallback } from 'react';
import styled from 'styled-components';

/* ── Types ── */

export interface QuestionStep {
  question: string;
  type: 'radio' | 'checkbox';
  options: string[];
}

export interface AgentQuestionCardProps {
  steps: QuestionStep[];
  showComments?: boolean;
  onSubmit?: (answers: Record<number, string[]>, comments: Record<number, string>) => void;
  onDismiss?: () => void;
}

/* ── Styled Components ── */

const CardWrap = styled.div`
  width: 100%;
  max-width: 722px;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 12px;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 4px 16px;
  background: #fbfaf9;
`;

const HeaderTitle = styled.span`
  font-weight: 700;
  font-size: 13px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 20px;
`;

const HeaderStep = styled.span`
  font-weight: 700;
  font-size: 13px;
  color: #18181b;
  letter-spacing: -0.3px;
  line-height: 20px;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
`;

const QuestionText = styled.p`
  font-weight: 500;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 24px;
  margin: 0;
`;

const OptionsWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const OptionRow = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  outline: none;
  font-family: 'Inter', sans-serif;
  text-align: left;

  &:hover {
    opacity: 0.8;
  }
`;

const OptionLabel = styled.span`
  font-weight: 500;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 20px;
`;

/* Radio / Checkbox icons */

const RadioOuter = styled.div<{ $checked: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid ${p => p.$checked ? '#242424' : 'rgba(36, 36, 36, 0.4)'};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.15s ease;
`;

const RadioInner = styled.div`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #242424;
`;

const CheckboxBox = styled.div<{ $checked: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid ${p => p.$checked ? '#242424' : 'rgba(36, 36, 36, 0.4)'};
  background: ${p => p.$checked ? '#242424' : 'transparent'};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.15s ease, background 0.15s ease;
`;

const CheckMark = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* Comments field */

const CommentsWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
`;

const CommentsLabel = styled.label`
  font-weight: 400;
  font-size: 11px;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 16px;
`;

const CommentsInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 2px solid rgba(36, 36, 36, 0.75);
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 24px;
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: rgba(36, 36, 36, 0.5);
  }

  &:focus {
    border-color: #242424;
  }
`;

/* Buttons */

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
`;

const BaseButton = styled.button`
  flex: 1;
  min-width: 80px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 24px;
  border: 2px solid #242424;
  border-radius: 24px;
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  cursor: pointer;
  outline: none;
  transition: opacity 0.15s ease, transform 0.1s ease;

  &:hover {
    opacity: 0.85;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const SecondaryButton = styled(BaseButton)`
  background: white;
`;

const PrimaryButton = styled(BaseButton)`
  background: #feeb29;
`;

const ArrowRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#242424" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const ArrowLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#242424" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

/* ── Component ── */

const AgentQuestionCard: React.FC<AgentQuestionCardProps> = ({
  steps,
  showComments = true,
  onSubmit,
  onDismiss,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [comments, setComments] = useState<Record<number, string>>({});

  const isMultiStep = steps.length > 1;
  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  const selected = answers[currentStep] || [];

  const toggleOption = useCallback((option: string) => {
    setAnswers(prev => {
      const current = prev[currentStep] || [];
      if (step.type === 'radio') {
        return { ...prev, [currentStep]: [option] };
      }
      // checkbox — toggle
      const next = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return { ...prev, [currentStep]: next };
    });
  }, [currentStep, step.type]);

  const handleNext = () => {
    if (!isLastStep) setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (!isFirstStep) setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = () => {
    onSubmit?.(answers, comments);
  };

  const handleDismiss = () => {
    onDismiss?.();
  };

  return (
    <CardWrap>
      <Header>
        <HeaderTitle>Agent has questions for you</HeaderTitle>
        {isMultiStep && (
          <HeaderStep>{currentStep + 1}/{steps.length}</HeaderStep>
        )}
      </Header>

      <Body>
        <QuestionText>{step.question}</QuestionText>

        <OptionsWrap>
          {step.options.map(option => {
            const isSelected = selected.includes(option);
            return (
              <OptionRow
                key={option}
                $selected={isSelected}
                onClick={() => toggleOption(option)}
                type="button"
              >
                {step.type === 'radio' ? (
                  <RadioOuter $checked={isSelected}>
                    {isSelected && <RadioInner />}
                  </RadioOuter>
                ) : (
                  <CheckboxBox $checked={isSelected}>
                    {isSelected && <CheckMark />}
                  </CheckboxBox>
                )}
                <OptionLabel>{option}</OptionLabel>
              </OptionRow>
            );
          })}
        </OptionsWrap>

        {showComments && (
          <CommentsWrap>
            <CommentsLabel>Additional comments (optional)</CommentsLabel>
            <CommentsInput
              value={comments[currentStep] || ''}
              onChange={e => setComments(prev => ({ ...prev, [currentStep]: e.target.value }))}
              placeholder=""
            />
          </CommentsWrap>
        )}

        <ButtonRow>
          {/* Left button */}
          {isMultiStep && !isFirstStep ? (
            <SecondaryButton onClick={handleBack} type="button">
              <ArrowLeft />
              Back
            </SecondaryButton>
          ) : (
            <SecondaryButton onClick={handleDismiss} type="button">
              Dismiss
            </SecondaryButton>
          )}

          {/* Right button */}
          {isMultiStep && !isLastStep ? (
            <PrimaryButton onClick={handleNext} type="button">
              Next
              <ArrowRight />
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={handleSubmit} type="button">
              Submit
            </PrimaryButton>
          )}
        </ButtonRow>
      </Body>
    </CardWrap>
  );
};

export default AgentQuestionCard;
