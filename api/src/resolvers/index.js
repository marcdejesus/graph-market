import { GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language/index.js';
import { userResolvers } from './userResolvers.js';
import { productResolvers } from './productResolvers.js';
import { orderResolvers } from './orderResolvers.js';

// Custom Date scalar
const DateType = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  parseValue(value) {
    return new Date(value); // value from the client
  },
  serialize(value) {
    return value.getTime(); // value sent to the client
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10)); // ast value is always in string format
    }
    return null;
  },
});

export const resolvers = {
  Date: DateType,
  
  Query: {
    ...userResolvers.Query,
    ...productResolvers.Query,
    ...orderResolvers.Query,
  },
  
  Mutation: {
    ...userResolvers.Mutation,
    ...productResolvers.Mutation,
    ...orderResolvers.Mutation,
  },
  
  Subscription: {
    ...orderResolvers.Subscription,
  },
  
  // Type resolvers
  User: userResolvers.User,
  Product: productResolvers.Product,
  Order: orderResolvers.Order,
  OrderItem: orderResolvers.OrderItem,
}; 