import { createComplexityLimitRule } from 'graphql-query-complexity';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import { performanceLogger } from '../utils/logging.js';

/**
 * GraphQL Query Complexity and Depth Analysis
 * Prevents expensive queries and potential DoS attacks
 */

// Complexity analysis for different field types
const typeComplexityMap = {
  // Scalar fields have low complexity
  scalar: 1,
  
  // Object fields have moderate complexity
  object: 2,
  
  // List fields have higher complexity (multiplied by estimated size)
  list: 5,
  
  // Paginated lists with arguments
  paginatedList: 3,
  
  // Database joins/populated fields
  populated: 4,
  
  // Search operations
  search: 10,
  
  // Analytics/aggregation operations
  analytics: 15,
  
  // Admin-only operations
  admin: 8,
};

/**
 * Custom complexity analysis function
 */
const createComplexityAnalysis = () => {
  return createComplexityLimitRule(1000, {
    maximumComplexity: 1000,
    
    // Introspection queries should have lower limits
    introspection: true,
    
    // Custom complexity calculation
    estimators: [
      // Field-level complexity estimation
      {
        createEstimator: ({ type, field }) => {
          return (args, childComplexity) => {
            const fieldName = field.name;
            let complexity = typeComplexityMap.scalar;
            
            // Determine base complexity based on field characteristics
            if (field.type.toString().includes('[')) {
              // List fields
              complexity = typeComplexityMap.list;
              
              // Factor in pagination arguments
              if (args.first || args.limit) {
                const limit = args.first || args.limit || 10;
                complexity = Math.min(complexity * Math.ceil(limit / 10), 50);
              }
            } else if (field.type.toString().includes('!')) {
              // Required fields (likely important data)
              complexity = typeComplexityMap.object;
            }
            
            // Field-specific complexity adjustments
            switch (fieldName) {
              case 'products':
              case 'orders':
              case 'users':
                complexity = typeComplexityMap.paginatedList;
                break;
                
              case 'searchProducts':
                complexity = typeComplexityMap.search;
                break;
                
              case 'orderStats':
              case 'productCategories':
              case 'popularProducts':
                complexity = typeComplexityMap.analytics;
                break;
                
              case 'allOrders':
              case 'updateUserRole':
                complexity = typeComplexityMap.admin;
                break;
                
              case 'createdBy':
              case 'user':
              case 'items':
                complexity = typeComplexityMap.populated;
                break;
            }
            
            // Add child complexity
            const totalComplexity = complexity + childComplexity;
            
            // Log high complexity fields for monitoring
            if (totalComplexity > 50) {
              performanceLogger.debug('High complexity field detected', {
                fieldName,
                fieldComplexity: complexity,
                childComplexity,
                totalComplexity,
                args,
              });
            }
            
            return totalComplexity;
          };
        },
      },
    ],
    
    // Custom error handling
    onComplete: (complexity, requestContext) => {
      const { operationName, document } = requestContext.request;
      
      performanceLogger.info('Query complexity analysis completed', {
        operationName: operationName || 'anonymous',
        complexity,
        maxComplexity: 1000,
      });
      
      // Log high complexity queries for optimization
      if (complexity > 500) {
        performanceLogger.warn('High complexity query detected', {
          operationName,
          complexity,
          query: document?.loc?.source?.body?.substring(0, 200) + '...',
        });
      }
    },
  });
};

/**
 * Query depth limiting
 */
const createDepthLimitRule = (maxDepth = 10) => {
  return depthLimit(maxDepth, {
    ignore: [
      // Allow introspection queries to have deeper nesting
      '__schema',
      '__type',
      '__field',
      '__inputValue',
      '__enumValue',
      '__directive',
    ],
  });
};

/**
 * Custom query analysis middleware
 */
export const queryAnalysisMiddleware = {
  requestDidStart() {
    return {
      didResolveOperation(requestContext) {
        const { operationName, document } = requestContext.request;
        
        if (document) {
          // Analyze query structure
          const analysis = analyzeQueryStructure(document);
          
          requestContext.queryAnalysis = {
            operationName: operationName || 'anonymous',
            ...analysis,
            startTime: Date.now(),
          };
          
          // Log query analysis
          performanceLogger.debug('Query analysis', {
            operationName: requestContext.queryAnalysis.operationName,
            depth: analysis.depth,
            fieldCount: analysis.fieldCount,
            hasFragments: analysis.hasFragments,
            hasVariables: analysis.hasVariables,
          });
        }
      },
      
      willSendResponse(requestContext) {
        if (requestContext.queryAnalysis) {
          const duration = Date.now() - requestContext.queryAnalysis.startTime;
          const success = !requestContext.errors || requestContext.errors.length === 0;
          
          performanceLogger.info('Query analysis completed', {
            ...requestContext.queryAnalysis,
            duration,
            success,
            errorCount: requestContext.errors?.length || 0,
          });
        }
      },
    };
  },
};

/**
 * Analyze query structure for monitoring and optimization
 */
function analyzeQueryStructure(document) {
  let depth = 0;
  let fieldCount = 0;
  let hasFragments = false;
  let hasVariables = false;
  let operationType = 'query';
  
  const visit = (node, currentDepth = 0) => {
    depth = Math.max(depth, currentDepth);
    
    if (node.kind === 'Field') {
      fieldCount++;
    }
    
    if (node.kind === 'FragmentDefinition' || node.kind === 'InlineFragment') {
      hasFragments = true;
    }
    
    if (node.kind === 'VariableDefinition') {
      hasVariables = true;
    }
    
    if (node.kind === 'OperationDefinition') {
      operationType = node.operation;
    }
    
    if (node.selectionSet) {
      node.selectionSet.selections.forEach(selection => {
        if (selection.selectionSet) {
          visit(selection, currentDepth + 1);
        } else {
          visit(selection, currentDepth);
        }
      });
    }
    
    // Visit other node properties
    Object.keys(node).forEach(key => {
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item && typeof item === 'object' && item.kind) {
            visit(item, currentDepth);
          }
        });
      } else if (value && typeof value === 'object' && value.kind) {
        visit(value, currentDepth);
      }
    });
  };
  
  document.definitions.forEach(definition => {
    visit(definition, 0);
  });
  
  return {
    depth,
    fieldCount,
    hasFragments,
    hasVariables,
    operationType,
  };
}

/**
 * Rate limiting based on query complexity
 */
export const createComplexityRateLimit = (windowMs = 60000, maxComplexityPerWindow = 5000) => {
  const complexityTracker = new Map();
  
  return {
    requestDidStart() {
      return {
        didResolveOperation(requestContext) {
          const clientId = this.getClientId(requestContext);
          const now = Date.now();
          
          // Clean up old entries
          const cutoff = now - windowMs;
          for (const [id, data] of complexityTracker.entries()) {
            data.requests = data.requests.filter(req => req.timestamp > cutoff);
            if (data.requests.length === 0) {
              complexityTracker.delete(id);
            }
          }
          
          requestContext.complexityRateLimit = {
            clientId,
            startTime: now,
          };
        },
        
        didEncounterErrors(requestContext) {
          // If there's a complexity error, still track it
          if (requestContext.complexityRateLimit) {
            this.trackComplexity(requestContext, 1000); // Assume max complexity for failed queries
          }
        },
        
        willSendResponse(requestContext) {
          if (requestContext.complexityRateLimit && requestContext.queryAnalysis) {
            // Use field count as a proxy for complexity if exact complexity isn't available
            const complexity = requestContext.queryComplexity || requestContext.queryAnalysis.fieldCount * 2;
            this.trackComplexity(requestContext, complexity);
          }
        },
      };
    },
    
    getClientId(requestContext) {
      // Use user ID if authenticated, otherwise IP address
      const context = requestContext.contextValue || requestContext.context;
      return context?.userId || context?.req?.ip || 'unknown';
    },
    
    trackComplexity(requestContext, complexity) {
      const { clientId, startTime } = requestContext.complexityRateLimit;
      
      if (!complexityTracker.has(clientId)) {
        complexityTracker.set(clientId, { requests: [] });
      }
      
      const clientData = complexityTracker.get(clientId);
      clientData.requests.push({
        timestamp: startTime,
        complexity,
      });
      
      // Check if client exceeded complexity limit
      const totalComplexity = clientData.requests.reduce((sum, req) => sum + req.complexity, 0);
      
      if (totalComplexity > maxComplexityPerWindow) {
        performanceLogger.warn('Client exceeded complexity rate limit', {
          clientId,
          totalComplexity,
          limit: maxComplexityPerWindow,
          requestCount: clientData.requests.length,
        });
        
        throw new GraphQLError(
          `Query complexity rate limit exceeded. Total complexity: ${totalComplexity}, Limit: ${maxComplexityPerWindow}`,
          {
            extensions: {
              code: 'COMPLEXITY_RATE_LIMIT_EXCEEDED',
              complexityUsed: totalComplexity,
              complexityLimit: maxComplexityPerWindow,
              windowMs,
            },
          }
        );
      }
    },
  };
};

/**
 * Export validation rules for Apollo Server
 */
export const createValidationRules = () => [
  createComplexityAnalysis(),
  createDepthLimitRule(15), // Max depth of 15 levels
];

/**
 * Export plugins for Apollo Server
 */
export const createQueryAnalysisPlugins = () => [
  queryAnalysisMiddleware,
  createComplexityRateLimit(),
]; 