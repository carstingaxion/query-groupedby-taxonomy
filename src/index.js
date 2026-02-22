/**
 * Query Loop Block Extension — Group by Taxonomy.
 *
 * Adds an Inspector control to the core/query block allowing users
 * to group query results by a selected taxonomy. The selected taxonomy
 * slug is stored as a custom block attribute and used server-side
 * to reorganize the rendered output.
 *
 * @package
 * @since   0.1.0
 */

import { __ } from '@wordpress/i18n';
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/block-editor';
import {
	PanelBody,
	SelectControl,
	Spinner,
	Notice,
} from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { useEffect, useMemo } from '@wordpress/element';

import './editor.scss';

/**
 * The block name we target for this extension.
 *
 * @type {string}
 */
const TARGET_BLOCK = 'core/query';

/**
 * GroupByTaxonomyPanel component.
 *
 * Renders the Inspector panel with taxonomy selection controls
 * for the core/query block. Uses the core data store to retrieve
 * available taxonomies for the current post type.
 *
 * @since 0.1.0
 *
 * @param {Object}   props               Component props.
 * @param {Object}   props.attributes    The block attributes.
 * @param {Function} props.setAttributes Function to update block attributes.
 *
 * @return {Element} The inspector panel element.
 */
function GroupByTaxonomyPanel( { attributes, setAttributes } ) {
	const { query, groupByTaxonomy } = attributes;
	const postType = query?.postType || 'post';

	/**
	 * Select taxonomies from the core store, filtered by the current post type.
	 *
	 * @type {{ taxonomyOptions: Array<{label: string, value: string}>, isLoading: boolean }}
	 */
	const { taxonomyOptions, isLoading } = useSelect(
		( select ) => {
			const { getTaxonomies, isResolving } = select( coreStore );

			/**
			 * Retrieve all public taxonomies associated with the current post type.
			 *
			 * @type {Array|null} Array of taxonomy objects or null while loading.
			 */
			const allTaxonomies = getTaxonomies( {
				type: postType,
				per_page: -1,
			} );

			/**
			 * Whether the store is still resolving the taxonomies request.
			 *
			 * @type {boolean}
			 */
			const loading = isResolving( 'getTaxonomies', [
				{ type: postType, per_page: -1 },
			] );

			/** @type {Array<{label: string, value: string}>} */
			const options = [
				{
					label: __(
						'— None (no grouping) —',
						'query-groupedby-taxonomy'
					),
					value: '',
				},
			];

			if ( Array.isArray( allTaxonomies ) ) {
				allTaxonomies
					.filter(
						( tax ) =>
							tax.visibility?.publicly_queryable ||
							tax.visibility?.show_ui
					)
					.forEach( ( tax ) => {
						options.push( {
							label: tax.name,
							value: tax.slug,
						} );
					} );
			}

			return {
				taxonomyOptions: options,
				isLoading: loading,
			};
		},
		[ postType ]
	);

	/**
	 * Reset the groupByTaxonomy attribute when the selected taxonomy
	 * is no longer valid for the current post type.
	 */
	useEffect( () => {
		if ( ! groupByTaxonomy || isLoading ) {
			return;
		}

		const validSlugs = taxonomyOptions
			.map( ( opt ) => opt.value )
			.filter( Boolean );

		if (
			validSlugs.length > 0 &&
			! validSlugs.includes( groupByTaxonomy )
		) {
			setAttributes( { groupByTaxonomy: '' } );
		}
	}, [ taxonomyOptions, groupByTaxonomy, isLoading, setAttributes ] );

	/**
	 * Build the updated query object with the custom groupByTaxonomy
	 * REST parameter so the editor preview reflects the grouped results.
	 *
	 * @type {Object|null}
	 */
	const updatedQuery = useMemo( () => {
		if ( ! query ) {
			return null;
		}

		const newQuery = { ...query };

		if ( groupByTaxonomy ) {
			newQuery.groupByTaxonomy = groupByTaxonomy;
		} else {
			delete newQuery.groupByTaxonomy;
		}

		return newQuery;
	}, [ query, groupByTaxonomy ] );

	/**
	 * Sync the groupByTaxonomy value into the query attribute
	 * so the REST API request includes it as a custom parameter.
	 */
	useEffect( () => {
		if ( ! updatedQuery || ! query ) {
			return;
		}

		const currentVal = query.groupByTaxonomy || '';
		const newVal = updatedQuery.groupByTaxonomy || '';

		if ( currentVal !== newVal ) {
			setAttributes( { query: updatedQuery } );
		}
	}, [ updatedQuery, query, setAttributes ] );

	return (
		<InspectorControls>
			<PanelBody
				title={ __( 'Group by Taxonomy', 'query-groupedby-taxonomy' ) }
				initialOpen={ true }
				className="query-groupedby-taxonomy-panel"
			>
				{ isLoading && (
					<div className="query-groupedby-taxonomy-panel__loading">
						<Spinner />
						<span>
							{ __(
								'Loading taxonomies…',
								'query-groupedby-taxonomy'
							) }
						</span>
					</div>
				) }

				{ ! isLoading && taxonomyOptions.length > 1 && (
					<>
						<SelectControl
							label={ __(
								'Taxonomy',
								'query-groupedby-taxonomy'
							) }
							value={ groupByTaxonomy || '' }
							options={ taxonomyOptions }
							onChange={ ( value ) =>
								setAttributes( { groupByTaxonomy: value } )
							}
							help={
								groupByTaxonomy
									? __(
											'Posts will be grouped by this taxonomy on the front end.',
											'query-groupedby-taxonomy'
									  )
									: __(
											'Select a taxonomy to enable grouping.',
											'query-groupedby-taxonomy'
									  )
							}
							__nextHasNoMarginBottom
						/>
					</>
				) }

				{ ! isLoading && taxonomyOptions.length <= 1 && (
					<Notice status="warning" isDismissible={ false }>
						{ __(
							'No public taxonomies found for the selected post type.',
							'query-groupedby-taxonomy'
						) }
					</Notice>
				) }
			</PanelBody>
		</InspectorControls>
	);
}

/**
 * Higher-order component that adds the Group by Taxonomy panel
 * to the core/query block's Inspector controls.
 *
 * @since 0.1.0
 *
 * @param {Function} BlockEdit The original BlockEdit component.
 *
 * @return {Function} The wrapped component.
 */
const withGroupByTaxonomyControls = createHigherOrderComponent(
	( BlockEdit ) => {
		/**
		 * Enhanced BlockEdit component.
		 *
		 * @param {Object} props Block edit props.
		 *
		 * @return {Element} The block edit element with additional controls.
		 */
		return ( props ) => {
			if ( props.name !== TARGET_BLOCK ) {
				return <BlockEdit { ...props } />;
			}

			return (
				<>
					<BlockEdit { ...props } />
					<GroupByTaxonomyPanel
						attributes={ props.attributes }
						setAttributes={ props.setAttributes }
					/>
				</>
			);
		};
	},
	'withGroupByTaxonomyControls'
);

addFilter(
	'editor.BlockEdit',
	'telex/query-posts-grouped-extension',
	withGroupByTaxonomyControls
);
