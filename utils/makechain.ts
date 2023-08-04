import { OpenAI } from 'langchain/llms/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { AttributeInfo } from 'langchain/schema/query_constructor';
import { SelfQueryRetriever } from 'langchain/retrievers/self_query';
import { PineconeTranslator } from 'langchain/retrievers/self_query/pinecone';
import {
  StructuredOutputParser,
  RegexParser,
  CombiningOutputParser,
} from 'langchain/output_parsers';
import { PromptTemplate } from 'langchain';

const CONDENSE_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`;

const QA_PROMPT = `You are a helpful AI assistant that helps citizens learn about legislative bills. Use the following pieces of context to answer the question at the end.
The question will contain the id of the bill. If it does not, DO NOT answer the question.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

{context}

{format_instructions}

Question: {question}
Helpful answer in markdown:`;

const attributeInfo: AttributeInfo[] = [
  {
    name: 'bill_id',
    description: 'The unique id of a bill. Every bill has a unique id.',
    type: 'string',
  },
  {
    name: 'congress',
    description:
      'The session of congress for which a bill was introduced. Each session indicates a 2 year period of congress.',
    type: 'number',
  },
  {
    name: 'bill_version',
    description:
      'The bill version. As bills pass through different congressional committees a new version is assigned to the bill. Different versions of bills usually have modifications to the bill text.',
    type: 'string',
  },
  {
    name: 'number',
    description:
      'A positive integer that indicates the index of the bill. The first bill introduced in a congress will have the number 1.',
    type: 'string',
  },
  {
    name: 'bill_version_issued_on',
    description: 'The date that a particular bill version was introduced.',
    type: 'string',
  },
  {
    name: 'bill_version_url',
    description: 'The url of a particular bill version.',
    type: 'string',
  },
];

const answerParser = StructuredOutputParser.fromNamesAndDescriptions({
  answer: "answer to the user's question",
  source: "source used to answer the user's question, should be a file path.",
});

const parser = new CombiningOutputParser(answerParser);

const formatInstructions = parser.getFormatInstructions();

const prompt = new PromptTemplate({
  template: QA_PROMPT,
  inputVariables: ['question', 'chat_history', 'context'],
  partialVariables: { format_instructions: formatInstructions },
});

export const makeChain = (vectorstore: PineconeStore) => {
  const model = new OpenAI({
    temperature: 0, // increase temepreature to get more creative answers
    modelName: 'gpt-3.5-turbo', //change this to gpt-4 if you have access
  });

  const selfQueryRetriever = SelfQueryRetriever.fromLLM({
    llm: model,
    vectorStore: vectorstore,
    documentContents:
      'Congressional bills from the united states congress and senate.',
    attributeInfo,
    /**
     * We need to create a basic translator that translates the queries into a
     * filter format that the vector store can understand. We provide a basic translator
     * translator here, but you can create your own translator by extending BaseTranslator
     * abstract class. Note that the vector store needs to support filtering on the metadata
     * attributes you want to query on.
     */
    structuredQueryTranslator: new PineconeTranslator(),
  });

  const chain = ConversationalRetrievalQAChain.fromLLM(
    model,
    selfQueryRetriever,
    {
      returnSourceDocuments: true, //The number of source documents returned is 4 by default
      qaChainOptions: {
        type: 'stuff',
        prompt,
      },
      questionGeneratorChainOptions: {
        template: CONDENSE_PROMPT,
      },
    },
  );

  return chain;
};
