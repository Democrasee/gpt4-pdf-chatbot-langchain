import { OpenAI } from 'langchain/llms/openai';
import { SqlDatabaseChain } from 'langchain/chains/sql_db';
import { SqlDatabase } from 'langchain/sql_db';
import { DataSource } from 'typeorm';
import { PromptTemplate } from 'langchain';

const template = `Given an input question, first create a syntactically correct {dialect} query to run, then look at the results of the query and return the answer.
Do not do, under any circumstances, create queries with CREATE, INSERT, DROP, UPDATE, ALTER or DELETE commands. You should never modify the database.
You are a read-only AI assistant. 
Table names are case sesitive so always put quotes around the table names.
Use the following format:

Question: "Question here"
SQLQuery: 'SQL Query to run'
SQLResult: "Result of the SQLQuery"
Answer: "Final answer here"

Only use the following tables:

{table_info}

Question: {input}`;

const prompt = new PromptTemplate({
    inputVariables: ['table_info', 'input', 'dialect'],
    template
});

export const makePostgresSqlChain = async () => {
  const model = new OpenAI({
    temperature: 0, // increase temepreature to get more creative answers
    modelName: 'gpt-3.5-turbo', //change this to gpt-4 if you have access
  });

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
  });

  const database = await SqlDatabase.fromDataSourceParams({
    appDataSource: dataSource,
    includesTables: [
      'Bill',
    ],
  });

  const chain = new SqlDatabaseChain({
    llm: model,
    database,
    prompt,
    sqlOutputKey: 'sql',
    verbose: true
  });

  return chain;
};
