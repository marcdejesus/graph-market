import { GraphQLError } from 'graphql';

export const productResolvers = {
  Query: {
    products: async () => {
      // Placeholder - will be implemented in Phase 2
      return {
        edges: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        totalCount: 0,
      };
    },

    product: async () => {
      // Placeholder - will be implemented in Phase 2
      return null;
    },
  },

  Mutation: {
    addProduct: async () => {
      throw new GraphQLError('Product management not yet implemented');
    },

    updateProduct: async () => {
      throw new GraphQLError('Product management not yet implemented');
    },

    deleteProduct: async () => {
      throw new GraphQLError('Product management not yet implemented');
    },
  },

  Product: {
    // Placeholder resolvers
    createdBy: () => null,
    inStock: (product) => product.stock > 0,
  },
}; 