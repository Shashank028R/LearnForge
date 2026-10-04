import { aiGateway } from '../ai/gateway/aiGateway.js';
import { KnowledgeEngineService } from './services/knowledgeEngineService.js';
import { EventExtractor } from './extraction/eventExtractor.js';
import { ConceptResolver } from './resolution/conceptResolver.js';
import { LearningStateMachine, LEARNING_STATES } from './state/learningStateMachine.js';

export const knowledgeEngine = new KnowledgeEngineService(aiGateway);

export {
  KnowledgeEngineService,
  EventExtractor,
  ConceptResolver,
  LearningStateMachine,
  LEARNING_STATES,
};
export default knowledgeEngine;
