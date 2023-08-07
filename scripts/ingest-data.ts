import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { S3RecursiveLoader } from '@/loaders/S3';

export const run = async (path: string) => {
  try {
    /*load raw docs from the all files in the directory */
    const documents = new S3RecursiveLoader(
      path,
      (object) => {
        if (object.Key) {
          return object.Key.includes('document.txt');
        }
        return false;
      },
      20000,
    );

    // const loader = new PDFLoader(filePath);
    const rawDocs = await documents.load();

    console.log(`Found ${rawDocs.length} documents.`);

    /* Split text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.splitDocuments(rawDocs);
    // console.log('split docs', docs);

    console.log('creating vector store...');
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings();
    const index = pinecone.Index(PINECONE_INDEX_NAME); //change to your own index name

    //embed the PDF documents
    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace: PINECONE_NAME_SPACE,
      textKey: 'text',
    });
  } catch (error) {
    console.log('error', error);
    throw new Error('Failed to ingest your data');
  }
};

(async () => {
  for (const path of [
    'raw/congress/data/118/bills/hconres',
    'raw/congress/data/118/bills/hjres',
    'raw/congress/data/118/bills/hr',
    'raw/congress/data/118/bills/hres',
    'raw/congress/data/118/bills/s',
    'raw/congress/data/118/bills/sconres',
    'raw/congress/data/118/bills/sjres',
    'raw/congress/data/118/bills/sres',
  ]) {
    await run(path);
    console.log('ingestion complete');
  }
})();
