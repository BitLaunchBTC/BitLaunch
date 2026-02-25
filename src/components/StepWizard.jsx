import React from 'react';
import { Check } from 'lucide-react';

/**
 * Multi-step wizard navigation component.
 *
 * @param {{ steps: string[], currentStep: number, onStepClick?: (index: number) => void }} props
 */
const StepWizard = ({ steps, currentStep, onStepClick }) => {
    return (
        <div className="step-wizard">
            {steps.map((label, index) => {
                const isCompleted = index < currentStep;
                const isActive = index === currentStep;
                const isClickable = onStepClick && index <= currentStep;

                return (
                    <React.Fragment key={index}>
                        <div
                            className={`step-wizard-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isClickable ? 'clickable' : ''}`}
                            onClick={() => isClickable && onStepClick(index)}
                            role={isClickable ? 'button' : undefined}
                            tabIndex={isClickable ? 0 : undefined}
                            onKeyDown={(e) => {
                                if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    onStepClick(index);
                                }
                            }}
                        >
                            <div className="step-wizard-circle">
                                {isCompleted ? (
                                    <Check size={14} />
                                ) : (
                                    <span>{index + 1}</span>
                                )}
                            </div>
                            <span className="step-wizard-label">{label}</span>
                        </div>
                        {index < steps.length - 1 && (
                            <div
                                className={`step-wizard-connector ${isCompleted ? 'completed' : ''}`}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default StepWizard;
