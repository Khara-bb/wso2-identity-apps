/**
 * Copyright (c) 2023-2025, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import Autocomplete, {
    AutocompleteRenderGetTagProps,
    AutocompleteRenderInputParams
} from "@oxygen-ui/react/Autocomplete";
import Chip from "@oxygen-ui/react/Chip";
import FormHelperText from "@oxygen-ui/react/FormHelperText";
import InputLabel from "@oxygen-ui/react/InputLabel";
import TextField from "@oxygen-ui/react/TextField";
import { AppConstants } from "@wso2is/admin.core.v1/constants/app-constants";
import { history } from "@wso2is/admin.core.v1/helpers/history";
import { FeatureConfigInterface } from "@wso2is/admin.core.v1/models/config";
import useGetOrganizations from "@wso2is/admin.organizations.v1/api/use-get-organizations";
import {
    GetOrganizationsParamsInterface,
    OrganizationInterface
} from "@wso2is/admin.organizations.v1/models/organizations";
import {
    AlertLevels,
    IdentifiableComponentInterface,
    SBACInterface
} from "@wso2is/core/models";
import { addAlert } from "@wso2is/core/store";
import {
    AutocompleteFieldAdapter,
    FinalForm,
    FinalFormField,
    FormRenderProps,
    FormSpy
} from "@wso2is/form";
import { EmphasizedSegment, Hint, PrimaryButton } from "@wso2is/react-components";
import { FormValidation } from "@wso2is/validation";
import debounce from "lodash-es/debounce";
import isEmpty from "lodash-es/isEmpty";
import React, {
    FunctionComponent,
    ReactElement,
    SyntheticEvent,
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { Dispatch } from "redux";
import addOrganizationEmailDomain from "../api/add-organization-email-domains";
import checkEmailDomainAvailable from "../api/check-email-domain-available";
import useGetOrganizationDiscovery from "../api/use-get-organization-discovery";
import {
    OrganizationDiscoveryCheckResponseInterface,
    OrganizationDiscoveryInterface,
    OrganizationLinkInterface
} from "../models/organization-discovery";
import "./add-organization-discovery-domains.scss";

/**
 * Props interface of {@link AddOrganizationDiscoveryDomains}
 */
export interface AddOrganizationDiscoveryDomainsPropsInterface
    extends SBACInterface<FeatureConfigInterface>,
        IdentifiableComponentInterface {
    /**
     * Is read only view
     */
    isReadOnly?: boolean;
    /**
     * Callback for when organization update
     */
    onEmailDomainAdd?: (organizationId: string) => void;
}

/**
 * Interface for the edit organization email domains form values.
 */
interface AddOrganizationDiscoveryDomainsFormValuesInterface {
    /**
     * Organization name.
     */
    organizationName: string;
}

const FORM_ID: string = "edit-organization-email-domains-form";

/**
 * This component renders the email domain add page for the organization.
 *
 * @param props - Props injected to the component.
 * @returns Functional component.
 */
const AddOrganizationDiscoveryDomains: FunctionComponent<AddOrganizationDiscoveryDomainsPropsInterface> = (
    props: AddOrganizationDiscoveryDomainsPropsInterface
): ReactElement => {
    const {
        isReadOnly,
        ["data-componentid"]: componentId
    } = props;

    const { t } = useTranslation();

    const dispatch: Dispatch = useDispatch();

    const { data: discoverableOrganizations } = useGetOrganizationDiscovery(true, null, null, null);

    const [ emailDomains, setEmailDomains ] = useState<string[]>([]);
    const [ isEmailDomainDataError, setIsEmailDomainDataError ] = useState<boolean>(false);
    const [ isEmailDomainAvailableError, setIsEmailDomainAvailableError ] = useState<boolean>(false);

    const [ organizations, setOrganizations ] = useState<OrganizationInterface[]>([]);
    const [ hasMoreOrganizations, setHasMoreOrganizations ] = useState(true);
    const [ inputValue, setInputValue ] = useState<string>("");
    const [ afterCursor, setAfterCursor ] = useState<string | null>(null);
    const [ params, setParams ] =
        useState<GetOrganizationsParamsInterface>({ after: null, limit: 15, shouldFetch: true });

    const queryPrefix: string = "name co ";

    const {
        data: organizationListResponse,
        isLoading: isOrganizationsFetchRequestLoading,
        isValidating: isOrganizationsFetchRequestValidating,
        error: organizationsFetchRequestError
    } = useGetOrganizations(params.shouldFetch, params.filter, params.limit, params.after, null, true, false);

    /**
     * Fetches the organization list.
     */
    useEffect(() => {
        if (!organizationListResponse || isOrganizationsFetchRequestLoading
            || isOrganizationsFetchRequestValidating) return;

        setParams((prevParams: GetOrganizationsParamsInterface) => ({
            ...prevParams,
            shouldFetch: false
        }));

        const updatedOrganizationList: OrganizationInterface[] = (organizationListResponse.organizations);

        setOrganizations((prevOptions: OrganizationInterface[]) => [
            ...prevOptions,
            ...(updatedOrganizationList || [])
        ]);

        let nextFound: boolean = false;

        organizationListResponse?.links?.forEach((link: OrganizationLinkInterface) => {
            if (link.rel === "next") {
                const nextCursor: string = link.href.split("after=")[1];

                setAfterCursor(nextCursor);
                setHasMoreOrganizations(!!nextCursor);
                nextFound = true;
            }
        });

        if (!nextFound) {
            setAfterCursor("");
            setHasMoreOrganizations(false);
        }
    }, [ organizationListResponse ]);

    /**
     * Dispatches error notifications if organization fetch request fails.
     */
    useEffect(() => {
        if (!organizationsFetchRequestError) {
            return;
        }

        if (organizationsFetchRequestError?.response?.data?.description) {
            dispatch(addAlert({
                description: organizationsFetchRequestError?.response?.data?.description
                    ?? t("organizations:notifications.getOrganizationList.error.description"),
                level: AlertLevels.ERROR,
                message: organizationsFetchRequestError?.response?.data?.message
                    ?? t("organizations:notifications.getOrganizationList.error.message")
            }));

            return;
        }

        dispatch(
            addAlert({
                description: t(
                    "organizations:notifications.getOrganizationList" +
                        ".genericError.description"
                ),
                level: AlertLevels.ERROR,
                message: t(
                    "organizations:notifications." +
                        "getOrganizationList.genericError.message"
                )
            })
        );
    }, [ organizationsFetchRequestError ]);

    /**
     * Update the params state whenever inputValue or cursor changes.
     */
    const updateParams = (cursor: string, inputValue: string) => {
        setAfterCursor(cursor);
        setInputValue(inputValue);
        setParams((prevParams: GetOrganizationsParamsInterface) => ({
            ...prevParams,
            after: cursor || null,
            filter: inputValue ? `${queryPrefix}${inputValue}` : "",
            shouldFetch: true
        }));
    };

    /**
     * Handles input changes in the input field.
     *
     * @param _event - The change event.
     * @param data - The new input value.
     */
    const handleInputChange: (_event: SyntheticEvent<HTMLElement>, data: string | null, reason: string) => void =
        useCallback(
            debounce((_event: SyntheticEvent<HTMLElement>, data: string | null) => {
                const newInputValue: string = data ?? "";

                setOrganizations([]);
                updateParams("", newInputValue);
            }, 100),
            [ updateParams ]
        );

    /**
     * Handles changes in the field.
     *
     * @param _event - The change event.
     * @param data - The new input value.
     */
    const handleOnChange = (_: SyntheticEvent, value: any) => {
        if (!value) {
            setOrganizations([]);
            updateParams("", "");
        }
    };

    /**
     * Loads more organization options when scrolled to the bottom.
     */
    const loadMoreOrganizations = () => {
        if (!hasMoreOrganizations) return;

        updateParams(afterCursor, inputValue);
    };

    /**
     * Filter the already configured organizations from the list of organizations.
     */
    const filteredDiscoverableOrganizations: OrganizationInterface[] = useMemo(() => {
        return organizations?.filter((organization: OrganizationInterface) => {
            return !discoverableOrganizations?.organizations?.some(
                (discoverableOrganization: OrganizationDiscoveryInterface) => {
                    return discoverableOrganization.organizationId === organization.id;
                }
            );
        }) ?? [];
    }, [ discoverableOrganizations, organizations ]);

    const optionsArray: string[] = [];

    /**
     * Function to handle the form submit action.
     *
     * @param values - Form values.
     */
    const handleSubmit = (values: AddOrganizationDiscoveryDomainsFormValuesInterface): void => {
        const organizationId: string = organizations?.find((organization: OrganizationInterface) => {
            return organization.name === values.organizationName;
        }).id;

        addOrganizationEmailDomain(organizationId, emailDomains)
            .then(() => {
                dispatch(
                    addAlert({
                        description: t(
                            "organizationDiscovery:notifications." +
                                "addEmailDomains.success.description"
                        ),
                        level: AlertLevels.SUCCESS,
                        message: t(
                            "organizationDiscovery:notifications." +
                                "addEmailDomains.success.message"
                        )
                    })
                );

                history.push({
                    pathname: AppConstants.getPaths()
                        .get("UPDATE_ORGANIZATION_DISCOVERY_DOMAINS")
                        .replace(":id", organizationId)
                });
            })
            .catch(() => {
                dispatch(
                    addAlert({
                        description: t(
                            "organizationDiscovery:notifications" +
                                ".addEmailDomains.error.description"
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            "organizationDiscovery:notifications" +
                                ".addEmailDomains.error.message"
                        )
                    })
                );
            });
    };

    /**
     * Function to check whether an email domain is available.
     *
     * @param values - Email domains.
     */
    const checkEmailDomainAvailability = async (emailDomain: string): Promise<boolean> => {

        let available: boolean = true;

        await checkEmailDomainAvailable(emailDomain)
            .then((response: OrganizationDiscoveryCheckResponseInterface) => {
                available = response?.available;
            })
            .catch(() => {
                dispatch(
                    addAlert({
                        description: t(
                            "organizationDiscovery:notifications" +
                                ".checkEmailDomain.error.description"
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            "organizationDiscovery:notifications" +
                                ".checkEmailDomain.error.message"
                        )
                    })
                );
            });

        return available;
    };

    /**
     * Function to validate the input string is a valid email domain.
     *
     * @param emailDomainList - Email domains.
     */
    const validateEmailDomain = async (emailDomainList: string[]) => {

        const isEmailDomainValid: boolean = FormValidation.domain(emailDomainList[emailDomainList.length-1]);

        if (!isEmailDomainValid) {
            setIsEmailDomainDataError(true);
            emailDomainList.pop();

            return;
        }

        const isEmailDomainAvailable: boolean = await checkEmailDomainAvailability(emailDomainList[
            emailDomainList.length-1]);

        if (!isEmailDomainAvailable) {
            setIsEmailDomainAvailableError(true);
            emailDomainList.pop();
        }
    };

    return (
        <EmphasizedSegment padded="very">
            <FinalForm
                initialValues={ null }
                keepDirtyOnReinitialize={ true }
                onSubmit={ (values: AddOrganizationDiscoveryDomainsFormValuesInterface) => {
                    handleSubmit(values);
                } }
                render={ ({ handleSubmit, submitting }: FormRenderProps) => {
                    return (
                        <form
                            id={ FORM_ID }
                            onSubmit={ handleSubmit }
                            className="add-organization-email-domain-form"
                        >
                            <FinalFormField
                                displayEmpty
                                fullWidth
                                FormControlProps={ {
                                    margin: "dense"
                                } }
                                ariaLabel="Organization name field"
                                data-componentid={ `${componentId}-form-organization-name-field` }
                                name="organizationName"
                                type="text"
                                label={ t(
                                    "organizationDiscovery:assign.form." +
                                    "fields.organizationName.label"
                                ) }
                                placeholder={
                                    isEmpty(organizations)
                                        ? t(
                                            "organizationDiscovery:assign.form." +
                                            "fields.organizationName.emptyPlaceholder.0"
                                        )
                                        : (
                                            isEmpty(filteredDiscoverableOrganizations)
                                                ? t(
                                                    "organizationDiscovery:assign.form." +
                                                    "fields.organizationName.emptyPlaceholder.1"
                                                ): t(
                                                    "organizationDiscovery:assign.form." +
                                                    "fields.organizationName.placeholder"
                                                ))
                                }
                                helperText={ (
                                    <Hint>
                                        { t(
                                            "organizationDiscovery:assign.form." +
                                            "fields.organizationName.hint"
                                        ) }
                                    </Hint>
                                ) }
                                component={ AutocompleteFieldAdapter }
                                options={
                                    filteredDiscoverableOrganizations?.map((organization: OrganizationInterface) => {
                                        return organization.name;
                                    })
                                }
                                hasMore={ hasMoreOrganizations }
                                loadMore={ loadMoreOrganizations }
                                handleInputChange={ handleInputChange }
                                handleOnChange= { handleOnChange }
                                renderValue={ (selected: string) => {
                                    if (!selected) {
                                        return (
                                            <em>
                                                {
                                                    t(
                                                        "organizationDiscovery:assign.form." +
                                                        "fields.organizationName.placeholder"
                                                    )
                                                }
                                            </em>
                                        );
                                    }

                                    return selected;
                                } }
                                required
                            />
                            <Autocomplete
                                fullWidth
                                multiple
                                freeSolo
                                disableCloseOnSelect
                                data-componentid={ `${componentId}-form-organization-email-domain-field` }
                                size="small"
                                id="tags-filled"
                                options={ optionsArray.map((option: string) => option) }
                                renderTags={ (value: readonly string[], getTagProps: AutocompleteRenderGetTagProps) => {
                                    return value.map((option: string, index: number) => (
                                        <Chip
                                            key={ index }
                                            size="medium"
                                            label={ option }
                                            { ...getTagProps({ index }) }
                                        />
                                    ));
                                } }
                                renderInput={ (params: AutocompleteRenderInputParams) => (
                                    <>
                                        <InputLabel htmlFor="tags-filled" disableAnimation shrink={ false }>
                                            { t(
                                                "organizationDiscovery:assign.form." +
                                                "fields.emailDomains.label"
                                            ) }
                                        </InputLabel>
                                        <TextField
                                            id="tags-filled"
                                            InputLabelProps={ {
                                                required: true
                                            } }
                                            { ...params }
                                            margin="dense"
                                            data-componentid={ `${componentId}-email-domain-message-field` }
                                            error={ isEmailDomainDataError || isEmailDomainAvailableError }
                                            helperText= {
                                                isEmailDomainDataError
                                                    ? t(
                                                        "organizationDiscovery:assign.form." +
                                                        "fields.emailDomains.validations.invalid.0"
                                                    )
                                                    : isEmailDomainAvailableError
                                                        ? t(
                                                            "organizationDiscovery:assign." +
                                                            "form.fields.emailDomains.validations.invalid.1"
                                                        )
                                                        : null
                                            }
                                            placeholder={ t(
                                                "organizationDiscovery:assign.form." +
                                                "fields.emailDomains.placeholder"
                                            ) }
                                        />
                                    </>
                                ) }
                                onChange={ (_: SyntheticEvent<Element, Event>, value: string[]) => {
                                    setEmailDomains(value);
                                    if (value.length > 0) {
                                        validateEmailDomain(value);
                                    }
                                } }
                                onInputChange={ () => {
                                    setIsEmailDomainDataError(false);
                                    setIsEmailDomainAvailableError(false);
                                } }
                            />
                            <FormHelperText>
                                <Hint>
                                    { t(
                                        "organizationDiscovery:assign.form." +
                                        "fields.emailDomains.hint"
                                    ) }
                                </Hint>
                            </FormHelperText>
                            <FormSpy subscription={ { values: true } }>
                                { ({ values }: { values: AddOrganizationDiscoveryDomainsFormValuesInterface }) => (
                                    !isReadOnly && (
                                        <PrimaryButton
                                            data-componentid={ `${componentId}-form-submit-button` }
                                            disabled={
                                                submitting || isEmpty(emailDomains) || isEmpty(values?.organizationName)
                                            }
                                            loading={ submitting }
                                            type="submit"
                                        >
                                            { t("organizationDiscovery:assign.buttons.assign") }
                                        </PrimaryButton>
                                    )
                                ) }
                            </FormSpy>
                        </form>
                    );
                } }
            />
        </EmphasizedSegment>
    );
};

/**
 * Props interface of {@link AddOrganizationDiscoveryDomains}
 */
AddOrganizationDiscoveryDomains.defaultProps = {
    "data-componentid": "add-organization-discovery-domains"
};

export default AddOrganizationDiscoveryDomains;
