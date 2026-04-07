-- AlterEnum: novos gatilhos de automação de funil
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'DEAL_STAGE_TRANSITION';
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'DEAL_CUSTOM_FIELD_CHANGED';
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'DEAL_ASSIGNEE_ASSIGNED';
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'DEAL_ASSIGNEE_REMOVED';
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'CONTACT_TAG_ADDED';
ALTER TYPE "PipelineAutomationTriggerType" ADD VALUE 'CONTACT_TAG_REMOVED';
