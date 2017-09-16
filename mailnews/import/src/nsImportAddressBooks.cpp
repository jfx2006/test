/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prprf.h"
#include "plstr.h"
#include "nsCOMPtr.h"
#include "nsMsgUtils.h"
#include "nsIImportService.h"
#include "nsIImportAddressBooks.h"
#include "nsIImportGeneric.h"
#include "nsISupportsPrimitives.h"
#include "nsIImportABDescriptor.h"
#include "nsIImportFieldMap.h"
#include "nsString.h"
#include "nsIFile.h"
#include "nsIAddrDatabase.h"
#include "nsIAbManager.h"
#include "nsIAbLDIFService.h"
#include "nsAbBaseCID.h"
#include "nsIStringBundle.h"
#include "nsImportStringBundle.h"
#include "nsTextFormatter.h"
#include "nsServiceManagerUtils.h"
#include "msgCore.h"
#include "ImportDebug.h"
#include "nsIAbMDBDirectory.h"
#include "nsComponentManagerUtils.h"
#include "nsIArray.h"
#include "nsCOMArray.h"
#include "nsArrayUtils.h"

static void ImportAddressThread(void *stuff);

class AddressThreadData;

class nsImportGenericAddressBooks : public nsIImportGeneric
{
public:

  nsImportGenericAddressBooks();

  NS_DECL_THREADSAFE_ISUPPORTS

  /* nsISupports GetData (in string dataId); */
  NS_IMETHOD GetData(const char *dataId, nsISupports **_retval) override;

  NS_IMETHOD SetData(const char *dataId, nsISupports *pData) override;

  NS_IMETHOD GetStatus(const char *statusKind, int32_t *_retval) override;

  NS_IMETHOD WantsProgress(bool *_retval) override;

  NS_IMETHOD BeginImport(nsISupportsString *successLog, nsISupportsString *errorLog, bool *_retval) override;

  NS_IMETHOD ContinueImport(bool *_retval) override;

  NS_IMETHOD GetProgress(int32_t *_retval) override;

  NS_IMETHOD CancelImport(void) override;

private:
  virtual ~nsImportGenericAddressBooks();
  void  GetDefaultLocation(void);
  void  GetDefaultBooks(void);
  void  GetDefaultFieldMap(void);

public:
  static void  SetLogs(nsString& success, nsString& error, nsISupportsString *pSuccess, nsISupportsString *pError);
  static void ReportError(const char16_t *pName, nsString *pStream,
                          nsIStringBundle *aBundle);

private:
  nsCOMPtr<nsIImportAddressBooks> m_pInterface;
  nsCOMPtr<nsIArray>              m_Books;
  nsCOMArray<nsIAddrDatabase>     m_DBs;
  nsCOMPtr <nsIFile>              m_pLocation;
  nsCOMPtr<nsIImportFieldMap>     m_pFieldMap;
  bool                            m_autoFind;
  char16_t *                      m_description;
  bool                            m_gotLocation;
  bool                            m_found;
  bool                            m_userVerify;
  nsCOMPtr<nsISupportsString>     m_pSuccessLog;
  nsCOMPtr<nsISupportsString>     m_pErrorLog;
  uint32_t                        m_totalSize;
  bool                            m_doImport;
  AddressThreadData *             m_pThreadData;
  nsCString                       m_pDestinationUri;
  nsCOMPtr<nsIStringBundle>       m_stringBundle;
};

class AddressThreadData {
public:
  bool              driverAlive;
  bool              threadAlive;
  bool              abort;
  bool              fatalError;
  uint32_t          currentTotal;
  uint32_t          currentSize;
  nsCOMPtr<nsIArray>              books;
  nsCOMArray<nsIAddrDatabase>*    dBs;
  nsCOMPtr<nsIAbLDIFService>      ldifService;
  nsCOMPtr<nsIImportAddressBooks> addressImport;
  nsCOMPtr<nsIImportFieldMap>     fieldMap;
  nsCOMPtr<nsISupportsString>     successLog;
  nsCOMPtr<nsISupportsString>     errorLog;
  nsCString                       pDestinationUri;
  nsCOMPtr<nsIStringBundle>       stringBundle;

  AddressThreadData();
  ~AddressThreadData();
};


nsresult NS_NewGenericAddressBooks(nsIImportGeneric** aImportGeneric)
{
    NS_PRECONDITION(aImportGeneric != nullptr, "null ptr");
    if (! aImportGeneric)
        return NS_ERROR_NULL_POINTER;

  RefPtr<nsImportGenericAddressBooks> pGen = new nsImportGenericAddressBooks();
  return pGen->QueryInterface(NS_GET_IID(nsIImportGeneric), (void **)aImportGeneric);
}

nsImportGenericAddressBooks::nsImportGenericAddressBooks()
{
  m_totalSize = 0;
  m_doImport = false;
  m_pThreadData = nullptr;

  m_autoFind = false;
  m_description = nullptr;
  m_gotLocation = false;
  m_found = false;
  m_userVerify = false;

  nsImportStringBundle::GetStringBundle(IMPORT_MSGS_URL, getter_AddRefs(m_stringBundle));
}


nsImportGenericAddressBooks::~nsImportGenericAddressBooks()
{
  if (m_description)
    NS_Free(m_description);
}



NS_IMPL_ISUPPORTS(nsImportGenericAddressBooks, nsIImportGeneric)


NS_IMETHODIMP nsImportGenericAddressBooks::GetData(const char *dataId, nsISupports **_retval)
{
  NS_ENSURE_ARG_POINTER(_retval);
  nsresult rv;
  *_retval = nullptr;
  if (!PL_strcasecmp(dataId, "addressInterface")) {
    NS_IF_ADDREF(*_retval = m_pInterface);
  }

  if (!PL_strcasecmp(dataId, "addressLocation")) {
    if (!m_pLocation)
      GetDefaultLocation();
    NS_IF_ADDREF(*_retval = m_pLocation);
  }

  if (!PL_strcasecmp(dataId, "addressBooks")) {
    if (!m_pLocation)
      GetDefaultLocation();
    if (!m_Books)
      GetDefaultBooks();
    *_retval = m_Books;
  }

  if (!PL_strcasecmp(dataId, "addressDestination")) {
    if (!m_pDestinationUri.IsEmpty()) {
      nsCOMPtr<nsISupportsCString> abString = do_CreateInstance(NS_SUPPORTS_CSTRING_CONTRACTID, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      abString->SetData(m_pDestinationUri);
      abString.forget(_retval);
    }
  }

  if (!PL_strcasecmp(dataId, "fieldMap")) {
    if (m_pFieldMap) {
      NS_ADDREF(*_retval = m_pFieldMap);
    }
    else {
      if (m_pInterface && m_pLocation) {
        bool needsIt = false;
        m_pInterface->GetNeedsFieldMap(m_pLocation, &needsIt);
        if (needsIt) {
          GetDefaultFieldMap();
          if (m_pFieldMap) {
            NS_ADDREF(*_retval = m_pFieldMap);
          }
        }
      }
    }
  }

  if (!PL_strncasecmp(dataId, "sampleData-", 11)) {
    // extra the record number
    const char *pNum = dataId + 11;
    int32_t  rNum = 0;
    while (*pNum) {
      rNum *= 10;
      rNum += (*pNum - '0');
      pNum++;
    }
    IMPORT_LOG1("Requesting sample data #: %ld\n", (long)rNum);
    if (m_pInterface) {
      nsCOMPtr<nsISupportsString>  data = do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID, &rv);
      if (NS_FAILED(rv))
        return rv;
      char16_t *  pData = nullptr;
      bool      found = false;
      rv = m_pInterface->GetSampleData(rNum, &found, &pData);
      if (NS_FAILED(rv))
        return rv;
      if (found) {
        data->SetData(nsDependentString(pData));
        data.forget(_retval);
      }
      NS_Free(pData);
    }
  }

  return NS_OK;
}


NS_IMETHODIMP nsImportGenericAddressBooks::SetData(const char *dataId, nsISupports *item)
{
  NS_PRECONDITION(dataId != nullptr, "null ptr");
  if (!dataId)
    return NS_ERROR_NULL_POINTER;

  if (!PL_strcasecmp(dataId, "addressInterface")) {
    m_pInterface = nullptr;
    if (item)
      m_pInterface = do_QueryInterface(item);
  }
  if (!PL_strcasecmp(dataId, "addressBooks")) {
    if (item)
      m_Books = do_QueryInterface(item);
  }

  if (!PL_strcasecmp(dataId, "addressLocation")) {
    m_pLocation = nullptr;

    if (item) {
      nsresult rv;
      m_pLocation = do_QueryInterface(item, &rv);
      NS_ENSURE_SUCCESS(rv,rv);
    }

    if (m_pInterface)
      m_pInterface->SetSampleLocation(m_pLocation);
  }

  if (!PL_strcasecmp(dataId, "addressDestination")) {
    if (item) {
      nsCOMPtr<nsISupportsCString> abString = do_QueryInterface(item);
      if (abString) {
        abString->GetData(m_pDestinationUri);
      }
    }
  }

  if (!PL_strcasecmp(dataId, "fieldMap")) {
    m_pFieldMap = nullptr;
    if (item)
      m_pFieldMap = do_QueryInterface(item);
  }

  return NS_OK;
}

NS_IMETHODIMP nsImportGenericAddressBooks::GetStatus(const char *statusKind, int32_t *_retval)
{
  NS_PRECONDITION(statusKind != nullptr, "null ptr");
  NS_PRECONDITION(_retval != nullptr, "null ptr");
  if (!statusKind || !_retval)
    return NS_ERROR_NULL_POINTER;

  *_retval = 0;

  if (!PL_strcasecmp(statusKind, "isInstalled")) {
    GetDefaultLocation();
    *_retval = (int32_t) m_found;
  }

  if (!PL_strcasecmp(statusKind, "canUserSetLocation")) {
    GetDefaultLocation();
    *_retval = (int32_t) m_userVerify;
  }

  if (!PL_strcasecmp(statusKind, "autoFind")) {
    GetDefaultLocation();
    *_retval = (int32_t) m_autoFind;
  }

  if (!PL_strcasecmp(statusKind, "supportsMultiple")) {
    bool      multi = false;
    if (m_pInterface)
      m_pInterface->GetSupportsMultiple(&multi);
    *_retval = (int32_t) multi;
  }

  if (!PL_strcasecmp(statusKind, "needsFieldMap")) {
    bool      needs = false;
    if (m_pInterface && m_pLocation)
      m_pInterface->GetNeedsFieldMap(m_pLocation, &needs);
    *_retval = (int32_t) needs;
  }

  return NS_OK;
}

void nsImportGenericAddressBooks::GetDefaultLocation(void)
{
  if (!m_pInterface)
    return;

  if ((m_pLocation && m_gotLocation) || m_autoFind)
    return;

  if (m_description)
    NS_Free(m_description);
  m_description = nullptr;
  m_pInterface->GetAutoFind(&m_description, &m_autoFind);
  m_gotLocation = true;
  if (m_autoFind) {
    m_found = true;
    m_userVerify = false;
    return;
  }

  nsCOMPtr <nsIFile> pLoc;
  m_pInterface->GetDefaultLocation(getter_AddRefs(pLoc), &m_found, &m_userVerify);
  if (!m_pLocation)
    m_pLocation = pLoc;
}

void nsImportGenericAddressBooks::GetDefaultBooks(void)
{
  if (!m_pInterface || m_Books)
    return;

  if (!m_pLocation && !m_autoFind)
    return;

  nsresult rv = m_pInterface->FindAddressBooks(m_pLocation, getter_AddRefs(m_Books));
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error: FindAddressBooks failed\n");
  }
}

void nsImportGenericAddressBooks::GetDefaultFieldMap(void)
{
  if (!m_pInterface || !m_pLocation)
    return;

  nsresult  rv;
  nsCOMPtr<nsIImportService> impSvc(do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Unable to get nsIImportService.\n");
    return;
  }

  rv = impSvc->CreateNewFieldMap(getter_AddRefs(m_pFieldMap));
  if (NS_FAILED(rv))
    return;

  int32_t  sz = 0;
  rv = m_pFieldMap->GetNumMozFields(&sz);
  if (NS_SUCCEEDED(rv))
    rv = m_pFieldMap->DefaultFieldMap(sz);
  if (NS_SUCCEEDED(rv))
    rv = m_pInterface->InitFieldMap(m_pFieldMap);
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error: Unable to initialize field map\n");
    m_pFieldMap = nullptr;
  }
}


NS_IMETHODIMP nsImportGenericAddressBooks::WantsProgress(bool *_retval)
{
  NS_PRECONDITION(_retval != nullptr, "null ptr");
  NS_ENSURE_ARG_POINTER(_retval);

  GetDefaultLocation();
  GetDefaultBooks();

  bool result = false;

  if (m_Books) {
    uint32_t    count = 0;
    uint32_t    i;
    bool        import;
    uint32_t    size;
    uint32_t    totalSize = 0;

    m_Books->GetLength(&count);

    for (i = 0; i < count; i++) {
      nsCOMPtr<nsIImportABDescriptor> book = do_QueryElementAt(m_Books, i);
      if (book) {
        import = false;
        size = 0;
        nsresult rv = book->GetImport(&import);
        if (NS_SUCCEEDED(rv) && import) {
          (void) book->GetSize(&size);
          result = true;
        }
        totalSize += size;
      }
    }

    m_totalSize = totalSize;
  }

  m_doImport = result;

  *_retval = result;

  return NS_OK;
}

void nsImportGenericAddressBooks::SetLogs(nsString& success, nsString& error, nsISupportsString *pSuccess, nsISupportsString *pError)
{
  nsAutoString str;
  if (pSuccess) {
    pSuccess->GetData(str);
        str.Append(success);
        pSuccess->SetData(success);
  }
  if (pError) {
    pError->GetData(str);
        str.Append(error);
        pError->SetData(error);
  }
}

already_AddRefed<nsIAddrDatabase> GetAddressBookFromUri(const char *pUri)
{
  if (!pUri)
    return nullptr;

  nsCOMPtr<nsIAbManager> abManager = do_GetService(NS_ABMANAGER_CONTRACTID);
  if (!abManager)
    return nullptr;

  nsCOMPtr<nsIAbDirectory> directory;
  abManager->GetDirectory(nsDependentCString(pUri),
                          getter_AddRefs(directory));
  if (!directory)
    return nullptr;

  nsCOMPtr<nsIAbMDBDirectory> mdbDirectory = do_QueryInterface(directory);
  if (!mdbDirectory)
    return nullptr;

  nsCOMPtr<nsIAddrDatabase> pDatabase;
  mdbDirectory->GetDatabase(getter_AddRefs(pDatabase));
  return pDatabase.forget();
}

already_AddRefed<nsIAddrDatabase> GetAddressBook(const char16_t *name,
                                                 bool makeNew)
{
  if (!makeNew) {
    // FIXME: How do I get the list of address books and look for a
    // specific name.  Major bogosity!
    // For now, assume we didn't find anything with that name
  }

  IMPORT_LOG0("In GetAddressBook\n");

  nsresult rv;
  nsCOMPtr<nsIAddrDatabase> pDatabase;
  nsCOMPtr<nsIFile> dbPath;
  nsCOMPtr<nsIAbManager> abManager = do_GetService(NS_ABMANAGER_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv))
  {
    /* Get the profile directory */
    rv = abManager->GetUserProfileDirectory(getter_AddRefs(dbPath));
    if (NS_SUCCEEDED(rv))
    {
      // Create a new address book file - we don't care what the file
      // name is, as long as it's unique
      rv = dbPath->Append(NS_LITERAL_STRING("impab.mab"));
      if (NS_SUCCEEDED(rv))
      {
        rv = dbPath->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);

        if (NS_SUCCEEDED(rv))
        {
          IMPORT_LOG0("Getting the address database factory\n");

          nsCOMPtr<nsIAddrDatabase> addrDBFactory =
            do_GetService(NS_ADDRDATABASE_CONTRACTID, &rv);
          if (NS_FAILED(rv))
            return nullptr;

          IMPORT_LOG0("Opening the new address book\n");
          rv = addrDBFactory->Open(dbPath, true, true,
                                   getter_AddRefs(pDatabase));
        }
      }
    }
  }
  if (NS_FAILED(rv))
  {
    IMPORT_LOG0("Failed to get the user profile directory from the address book session\n");
  }

  if (pDatabase && dbPath)
  {
    // We made a database, add it to the UI?!?!?!?!?!?!
    // This is major bogosity again!  Why doesn't the address book
    // just handle this properly for me?  Uggggg...

    nsCOMPtr<nsIAbDirectory> parentDir;
    abManager->GetDirectory(NS_LITERAL_CSTRING(kAllDirectoryRoot),
                            getter_AddRefs(parentDir));
    if (parentDir)
    {
      nsAutoCString URI("moz-abmdbdirectory://");
      nsAutoCString leafName;
      rv = dbPath->GetNativeLeafName(leafName);
      if (NS_FAILED(rv))
        IMPORT_LOG0("*** Error: Unable to get name of database file\n");
      else
      {
        URI.Append(leafName);
        rv = parentDir->CreateDirectoryByURI(nsDependentString(name), URI);
        if (NS_FAILED(rv))
          IMPORT_LOG0("*** Error: Unable to create address book directory\n");
      }
    }

    if (NS_SUCCEEDED(rv))
      IMPORT_LOG0("Added new address book to the UI\n");
    else
      IMPORT_LOG0("*** Error: An error occurred while adding the address book to the UI\n");
  }

  return pDatabase.forget();
}

NS_IMETHODIMP nsImportGenericAddressBooks::BeginImport(nsISupportsString *successLog, nsISupportsString *errorLog, bool *_retval)
{
  NS_PRECONDITION(_retval != nullptr, "null ptr");
    if (!_retval)
        return NS_ERROR_NULL_POINTER;

  nsString  success;
  nsString  error;

  if (!m_doImport) {
    *_retval = true;
    nsImportStringBundle::GetStringByID(IMPORT_NO_ADDRBOOKS, m_stringBundle,
                                        success);
    SetLogs(success, error, successLog, errorLog);
    return NS_OK;
  }

  if (!m_pInterface || !m_Books) {
    nsImportStringBundle::GetStringByID(IMPORT_ERROR_AB_NOTINITIALIZED,
                                        m_stringBundle, error);
    SetLogs(success, error, successLog, errorLog);
    *_retval = false;
    return NS_OK;
  }

  bool needsFieldMap = false;

  if (NS_FAILED(m_pInterface->GetNeedsFieldMap(m_pLocation, &needsFieldMap)) ||
      (needsFieldMap && !m_pFieldMap)) {
    nsImportStringBundle::GetStringByID(IMPORT_ERROR_AB_NOTINITIALIZED,
                                        m_stringBundle, error);
    SetLogs(success, error, successLog, errorLog);
    *_retval = false;
    return NS_OK;
  }

  m_pSuccessLog = successLog;
  m_pErrorLog = errorLog;

  // create the info need to drive address book import. We're
  // not going to create a new thread for this since address books
  // don't tend to be large, and import is rare.
  m_pThreadData = new AddressThreadData();
  m_pThreadData->books = m_Books;
  m_pThreadData->addressImport = m_pInterface;
  m_pThreadData->fieldMap = m_pFieldMap;
  m_pThreadData->errorLog = m_pErrorLog;
  m_pThreadData->successLog = m_pSuccessLog;
  m_pThreadData->pDestinationUri = m_pDestinationUri;

  uint32_t count = 0;
  m_Books->GetLength(&count);
  // Create/obtain any address books that we need here, so that we don't need
  // to do so inside the import thread which would just proxy the create
  // operations back to the main thread anyway.
  nsCOMPtr<nsIAddrDatabase> db = GetAddressBookFromUri(m_pDestinationUri.get());
  for (uint32_t i = 0; i < count; ++i)
  {
    nsCOMPtr<nsIImportABDescriptor> book = do_QueryElementAt(m_Books, i);
    if (book)
    {
      if (!db)
      {
        nsString name;
        book->GetPreferredName(name);
        db = GetAddressBook(name.get(), true);
      }
      m_DBs.AppendObject(db);
    }
  }
  m_pThreadData->dBs = &m_DBs;

  m_pThreadData->stringBundle = m_stringBundle;

  nsresult rv;
  m_pThreadData->ldifService = do_GetService(NS_ABLDIFSERVICE_CONTRACTID, &rv);

  ImportAddressThread(m_pThreadData);
  delete m_pThreadData;
  m_pThreadData = nullptr;
  *_retval = true;

  return NS_OK;
}

NS_IMETHODIMP nsImportGenericAddressBooks::ContinueImport(bool *_retval)
{
    NS_PRECONDITION(_retval != nullptr, "null ptr");
    if (!_retval)
        return NS_ERROR_NULL_POINTER;

  *_retval = true;
  if (m_pThreadData) {
    if (m_pThreadData->fatalError)
      *_retval = false;
  }

  return NS_OK;
}


NS_IMETHODIMP nsImportGenericAddressBooks::GetProgress(int32_t *_retval)
{
  // This returns the progress from the the currently
  // running import mail or import address book thread.
    NS_PRECONDITION(_retval != nullptr, "null ptr");
    if (!_retval)
        return NS_ERROR_NULL_POINTER;

  if (!m_pThreadData || !(m_pThreadData->threadAlive)) {
    *_retval = 100;
    return NS_OK;
  }

  uint32_t sz = 0;
  if (m_pThreadData->currentSize && m_pInterface) {
    if (NS_FAILED(m_pInterface->GetImportProgress(&sz)))
      sz = 0;
  }

  if (m_totalSize)
    *_retval = ((m_pThreadData->currentTotal + sz) * 100) / m_totalSize;
  else
    *_retval = 0;

  // never return less than 5 so it looks like we are doing something!
  if (*_retval < 5)
    *_retval = 5;

  // as long as the thread is alive don't return completely
  // done.
  if (*_retval > 99)
    *_retval = 99;

  return NS_OK;
}


NS_IMETHODIMP nsImportGenericAddressBooks::CancelImport(void)
{
  if (m_pThreadData) {
    m_pThreadData->abort = true;
    m_pThreadData = nullptr;
  }

  return NS_OK;
}


AddressThreadData::AddressThreadData()
{
  fatalError = false;
  driverAlive = true;
  threadAlive = true;
  abort = false;
  currentTotal = 0;
  currentSize = 0;
}

AddressThreadData::~AddressThreadData()
{
}

void nsImportGenericAddressBooks::ReportError(const char16_t *pName,
                                              nsString *pStream,
                                              nsIStringBundle* aBundle)
{
  if (!pStream)
    return;
  // load the error string
  char16_t *pFmt = nsImportStringBundle::GetStringByID(IMPORT_ERROR_GETABOOK, aBundle);
  nsString pText;
  nsTextFormatter::ssprintf(pText, pFmt, pName);
  pStream->Append(pText);
  NS_Free(pFmt);
  pStream->AppendLiteral(MSG_LINEBREAK);
}

static void ImportAddressThread(void *stuff)
{
  IMPORT_LOG0("In Begin ImportAddressThread\n");

  AddressThreadData *pData = (AddressThreadData *)stuff;
  uint32_t          count = 0;
  uint32_t          i;
  bool              import;
  uint32_t          size;

  nsString          success;
  nsString          error;

  (void) pData->books->GetLength(&count);

  for (i = 0; (i < count) && !(pData->abort); i++) {
    nsCOMPtr<nsIImportABDescriptor> book =
      do_QueryElementAt(pData->books, i);

    if (book) {
      import = false;
      size = 0;
      nsresult rv = book->GetImport(&import);
      if (NS_SUCCEEDED(rv) && import)
        rv = book->GetSize(&size);

      if (NS_SUCCEEDED(rv) && size && import) {
        nsString name;
        book->GetPreferredName(name);

        nsCOMPtr<nsIAddrDatabase> db = pData->dBs->ObjectAt(i);

        bool fatalError = false;
        pData->currentSize = size;
        if (db) {
          char16_t *pSuccess = nullptr;
          char16_t *pError = nullptr;

          /*
          if (pData->fieldMap) {
            int32_t    sz = 0;
            int32_t    mapIndex;
            bool      active;
            pData->fieldMap->GetMapSize(&sz);
            IMPORT_LOG1("**** Field Map Size: %d\n", (int) sz);
            for (int32_t i = 0; i < sz; i++) {
              pData->fieldMap->GetFieldMap(i, &mapIndex);
              pData->fieldMap->GetFieldActive(i, &active);
              IMPORT_LOG3("Field map #%d: index=%d, active=%d\n", (int) i, (int) mapIndex, (int) active);
            }
          }
          */

          rv = pData->addressImport->ImportAddressBook(book,
                                                       db,
                                                       pData->fieldMap,
                                                       pData->ldifService,
                                                       &pError,
                                                       &pSuccess,
                                                       &fatalError);
          if (NS_SUCCEEDED(rv) && pSuccess) {
            success.Append(pSuccess);
            NS_Free(pSuccess);
          }
          if (pError) {
            error.Append(pError);
            NS_Free(pError);
          }
        }
        else {
          nsImportGenericAddressBooks::ReportError(name.get(), &error, pData->stringBundle);
        }

        pData->currentSize = 0;
        pData->currentTotal += size;

        if (db)
          db->Close(true);

        if (fatalError) {
          pData->fatalError = true;
          break;
        }
      }
    }
  }


  nsImportGenericAddressBooks::SetLogs(success, error, pData->successLog, pData->errorLog);

  if (pData->abort || pData->fatalError) {
    // FIXME: do what is necessary to get rid of what has been imported so far.
    // Nothing if we went into an existing address book!  Otherwise, delete
    // the ones we created?
  }

}
